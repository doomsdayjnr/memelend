use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, CloseAccount, TokenAccount, Token, Mint};
use crate::{VaultConfig, TokenConfig, Position, ErrorCode, ReferralVault, YieldVault};


pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClosePositionArgs {
    pub position_id: u64,
    pub min_token_repay: u64,
}

#[derive(Accounts)]
#[instruction(args: ClosePositionArgs)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: signer PDA
    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,

    #[account(
        mut,
        // close = user
    )]
    pub position: Box<Account<'info, Position>>,

    pub token_config: Box<Account<'info, TokenConfig>>,

    #[account(
        mut,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA authority for vaults
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,

    #[account(
        mut,
        constraint = token_liquidity_vault.mint == token_config.mint,
    )]
    pub token_liquidity_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub lending_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
    )]
    pub liquidity_sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault_project", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = vault_authority,
    )]
    pub project_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault_platform", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = vault_authority,
    )]
    pub platform_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for referral
    #[account(
        seeds = [b"vault_referral_authority", referrer.key().as_ref()],
        bump,
    )]
    pub referral_vault_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"vault_referral", referrer.key().as_ref()],
        bump,
    )]
    pub referral_tracking: Box<Account<'info, ReferralVault>>,

    #[account(
        mut,
        token::mint = wsol_mint,
        token::authority = referral_vault_authority,
        seeds = [b"vault_referral_token", referrer.key().as_ref()],
        bump,
    )]
    pub referral_token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_liquidity_authority", mint.key().as_ref()],
        bump,
    )]
    pub liquidity_vault_authority: UncheckedAccount<'info>,

    /// CHECK: PDA for wSOL vault authority
    #[account(
        seeds = [b"vault_wsol_authority", mint.key().as_ref()],
        bump,
    )]
    pub wsol_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub yield_vault: Account<'info, YieldVault>,

    /// CHECK: Only used for seeds/validation
    pub referrer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn close_position(ctx: Context<ClosePosition>, args: ClosePositionArgs) -> Result<()> {
    let _position_id = args.position_id;

    let position = &ctx.accounts.position;

    // Check to see if its the correct position ID
    require!(
        args.position_id == position.position_id,
        ErrorCode::InvalidPositionId
    );

    const MIN_SOL_RESERVE: i128 = 1_000_000; 

    let vault_config = &mut ctx.accounts.vault_config;
    let token_config = &mut ctx.accounts.token_config;
    let token_program = &ctx.accounts.token_program;
    let now = Clock::get()?.unix_timestamp;

    let borrowed_tokens = position.amount;
    let original_collateral = position.collateral;

    msg!("borrowed_tokens: {}", borrowed_tokens);
    msg!("original_collateral: {}", original_collateral);
   

    let token_reserve = vault_config.token_reserve;
    let sol_reserve = vault_config.sol_reserve;
    let accumulated_c = vault_config.accumulated_c;
    let virtual_sol = vault_config.virtual_sol;
    let virtual_tokens = vault_config.virtual_tokens;

    // --- Compute full effective SOL reserve (includes virtual + accumulated_c) ---
    let effective_sol_i128 = (sol_reserve as i128)
        .checked_add(accumulated_c as i128)
        .and_then(|s| s.checked_add(virtual_sol as i128))
        .ok_or(ErrorCode::Overflow)?;

    // Prevent negative reserve
    require!(effective_sol_i128 >= 0, ErrorCode::Underflow);

    let effective_sol_reserve = effective_sol_i128 as u64;

    // --- Clamp accumulated_c if reserve falls below floor ---
    if i128::from(effective_sol_reserve) < MIN_SOL_RESERVE {
        let clamped = (MIN_SOL_RESERVE as i128)
            .checked_sub((sol_reserve as i128).checked_add(virtual_sol as i128).unwrap_or(0))
            .and_then(|v| i64::try_from(v).ok())
            .unwrap_or(i64::MIN);

        vault_config.accumulated_c = clamped;
    }

    // --- Combine token reserve with virtual tokens ---
    let effective_token_reserve = token_reserve
        .checked_add(virtual_tokens)
        .ok_or(ErrorCode::Overflow)?;

    // --- Reverse bonding curve: how much SOL you'd get for repaying borrowed_tokens ---
    let numerator = (borrowed_tokens as u128)
        .checked_mul(effective_sol_reserve as u128)
        .ok_or(ErrorCode::Overflow)?;

    let denominator = (effective_token_reserve as u128)
        .checked_add(borrowed_tokens as u128)
        .ok_or(ErrorCode::Overflow)?;

    // Value now (u128 -> u64 conversion)
    let value_now_u128 = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::DivisionByZero)?;

    let value_now = u64::try_from(value_now_u128).map_err(|_| ErrorCode::Overflow)?;

    msg!("value_now: {}", value_now);

  
    let d = ctx.accounts.mint.decimals as u32;

    // Correct value_entry computation:
    // Multiply before dividing to avoid truncation.
    let value_entry_u128 = (position.entry_price as u128)
        .checked_mul(borrowed_tokens as u128)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10u128.pow(d + 6))   // undo 10^decimals and extra 1e6 precision
        .ok_or(ErrorCode::DivisionByZero)?;

    msg!("value_entry_u128: {}", value_entry_u128);

    let value_entry = u64::try_from(value_entry_u128).map_err(|_| ErrorCode::Overflow)?;

    msg!("value_entry: {}", value_entry);

    let pnl: i128 = value_entry as i128 - value_now as i128; // Positive = profit, Negative = loss

    msg!("pnl: {}", pnl);
   
    let mut adjusted_collateral = original_collateral as i128 + pnl;

    msg!("adjusted_collateral: {}", adjusted_collateral);
   
    let is_profit = pnl > 0;

    let pnl_difference = pnl.unsigned_abs();

    msg!("pnl_difference: {}", pnl_difference);

    // === Update accumulated_c safely ===
    if pnl < 0 {
        // Loss: Increase accumulated_c (more buffer needed)
        vault_config.accumulated_c = vault_config.accumulated_c
            .checked_add(pnl_difference as i64)
            .ok_or(ErrorCode::Overflow)?
            .max((MIN_SOL_RESERVE as i128 - sol_reserve as i128) as i64);
    } else if pnl > 0 {
        // Profit: Decrease accumulated_c (buffer can shrink)
        vault_config.accumulated_c = vault_config.accumulated_c
            .checked_sub(pnl_difference as i64)
            .ok_or(ErrorCode::Overflow)?;
    }

     // Clamp to 0 minimum
    if adjusted_collateral < 0 {
        adjusted_collateral = 0;
    }


    // START Compute fees
    let pre_sale_participants = token_config.pre_sale_participants;
    let mut pre_sale_fee_sol = 0u64;
    

    // --- Calculate the base creator fee (e.g. 0.5%) ---
    let mut creator_fee_sol = ((adjusted_collateral as u64)
        .checked_mul(token_config.creator_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;


    // --- If presale participants exist, redirect half of creator fees ---
    if pre_sale_participants > 0 {
        // Take half of the creator’s fee and give to presale pool
        pre_sale_fee_sol = creator_fee_sol
            .checked_div(2)
            .ok_or(ErrorCode::Underflow)?;

        // Reduce creator's fee accordingly
        creator_fee_sol = creator_fee_sol
            .checked_sub(pre_sale_fee_sol)
            .ok_or(ErrorCode::Underflow)?;

        let presale_new_rewards = pre_sale_fee_sol as u128;

         // --- Update cumulative reward per share ---
        token_config.pre_sale_acc_fee_per_share = token_config
            .pre_sale_acc_fee_per_share
            .checked_add(
                presale_new_rewards
                    .checked_mul(PRECISION)
                    .ok_or(ErrorCode::Overflow)?
                    .checked_div(token_config.pre_sale_tokens_sold as u128)
                    .ok_or(ErrorCode::Underflow)?,
            )
            .ok_or(ErrorCode::Overflow)?;

        vault_config.pre_sale_vault = vault_config
            .pre_sale_vault
            .checked_add(pre_sale_fee_sol as u64)
            .ok_or(ErrorCode::Overflow)?;

        token_config.last_accrual_ts = now;
    }


    msg!("pre_sale_fee_sol: {}", pre_sale_fee_sol);
    msg!("creator_fee_sol: {}", creator_fee_sol);

    let total_platform_fee_bps = token_config.platform_fee_bps as u64; // 100 = 1%
    let referral_cut_bps = 40; // 0.4%
    let mut yield_cut_bps = 10; // 0.1%

    let mut platform_share_sol = ((adjusted_collateral as u64)
        .checked_mul(total_platform_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;


    let is_referral = ctx.accounts.referrer.key() != ctx.accounts.platform_vault.key();

    let referral_share_sol = if is_referral {
        let referral_fee = ((adjusted_collateral as u64)
            .checked_mul(referral_cut_bps as u64)
            .ok_or(ErrorCode::Overflow)? / 10_000) as u64;

        let platform_fee = platform_share_sol
            .checked_sub(referral_fee)
            .ok_or(ErrorCode::Underflow)?;

        // Overwrite platform_share_sol with reduced value
        platform_share_sol = platform_fee;

        // Track referral rewards
        ctx.accounts.referral_tracking.pending_rewards = ctx
            .accounts.referral_tracking
            .pending_rewards
            .checked_add(referral_fee)
            .ok_or(ErrorCode::Overflow)?; // divide after to prevent precision loss

        referral_fee
    } else {
        // If no referrer, increase yield share from 0.1% → 0.2%
        yield_cut_bps = 20; // 0.2%

        0
    };
    // --- Compute yield share ---
    let yield_share_sol = ((adjusted_collateral as u64)
        .checked_mul(yield_cut_bps)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;

    // --- Adjust final platform share ---
    platform_share_sol = platform_share_sol
        .checked_sub(yield_share_sol)
        .ok_or(ErrorCode::Underflow)?;

    msg!("platform_share_sol: {}", platform_share_sol);
    msg!("yield_share_sol: {}", yield_share_sol);
    msg!("referral_share_sol: {}", referral_share_sol);
    msg!("updated referral pending reward: {}", ctx.accounts.referral_tracking.pending_rewards);

    // --- Sum all fee components safely ---
    let total_fees_sol = creator_fee_sol
        .checked_add(platform_share_sol)
        .and_then(|v| v.checked_add(referral_share_sol))
        .and_then(|v| v.checked_add(yield_share_sol))
        .and_then(|v| v.checked_add(pre_sale_fee_sol))
        .ok_or(ErrorCode::Overflow)?;
   

    let project_fees_sol = creator_fee_sol
        .checked_add(yield_share_sol)
        .and_then(|v| v.checked_add(pre_sale_fee_sol))
        .ok_or(ErrorCode::Overflow)?;

    msg!("total_fees_sol: {}", total_fees_sol);
    msg!("project_fees_sol: {}", project_fees_sol);

    // END Compute fees


    // Calculate collateral after fee deductions
    let final_collateral = adjusted_collateral
        .checked_sub(total_fees_sol as i128)
        .ok_or(ErrorCode::Underflow)?;

    msg!("final_collateral: {}", final_collateral);

    // Slippage check
    require!(
        borrowed_tokens >= args.min_token_repay,
        ErrorCode::SlippageExceeded
    );

    // === Token Repayment ===
    let bump = ctx.bumps.liquidity_vault_authority;
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"vault_liquidity_authority",
        mint_key.as_ref(),
        &[bump],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_liquidity_vault.to_account_info(),
                to: ctx.accounts.lending_vault.to_account_info(),
                authority: ctx.accounts.liquidity_vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        borrowed_tokens,
    )?;

    let bump = ctx.bumps.wsol_vault_authority;
    let signer_seeds: &[&[u8]] = &[
        b"vault_wsol_authority",
        vault_config.mint.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[signer_seeds];

    // Transfer fees and net SOL
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidity_sol_vault.to_account_info(),
                to: ctx.accounts.project_vault.to_account_info(),
                authority: ctx.accounts.wsol_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        project_fees_sol,
    )?;


    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidity_sol_vault.to_account_info(),
                to: ctx.accounts.platform_vault.to_account_info(),
                authority: ctx.accounts.wsol_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        platform_share_sol,
    )?;

    if referral_share_sol > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.liquidity_sol_vault.to_account_info(),
                    to: ctx.accounts.referral_token_vault.to_account_info(),
                    authority: ctx.accounts.wsol_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            referral_share_sol,
        )?;

        ctx.accounts.referral_tracking.total_earned = ctx
            .accounts
            .referral_tracking
            .total_earned
            .checked_add(referral_share_sol)
            .ok_or(ErrorCode::Overflow)?;
    }
    
    
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidity_sol_vault.to_account_info(),
                to: ctx.accounts.temp_wsol_account.to_account_info(),
                authority: ctx.accounts.wsol_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        final_collateral as u64,
    )?;
    
    let position = &mut ctx.accounts.position;
    position.open = false;

    vault_config.token_reserve = vault_config
            .token_reserve
            .checked_sub(borrowed_tokens as u64)
            .ok_or(ErrorCode::Underflow)?;

    // Get vault mutable
    let yield_vault = &mut ctx.accounts.yield_vault;
    

    // Compute acc_reward_per_share delta
    if yield_vault.total_staked > 0 {
        // new rewards = interest added (WSOL)
        let new_rewards = yield_share_sol as u128;

        // Update cumulative reward per share
        yield_vault.acc_reward_per_share = yield_vault
            .acc_reward_per_share
            .checked_add(new_rewards * PRECISION / yield_vault.total_staked as u128)
            .ok_or(ErrorCode::Overflow)?;

        yield_vault.last_accrual_ts = now;
    }

    vault_config.creator_vault = vault_config
            .creator_vault
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 

    vault_config.platform_vault = vault_config
            .platform_vault
            .checked_add(platform_share_sol)
            .ok_or(ErrorCode::Overflow)?;
    
    vault_config.yield_vault = vault_config
            .yield_vault
            .checked_add(yield_share_sol as u64)
            .ok_or(ErrorCode::Overflow)?; 
    
    yield_vault.total_earned = yield_vault
            .total_earned
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 


    token::close_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.temp_wsol_account.to_account_info(),
                destination: ctx.accounts.user.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        )
    )?;

    emit!(ClosePositionEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        repaid_tokens: borrowed_tokens,
        collateral_returned: final_collateral as u64,
        total_fees: total_fees_sol,
        interest: vault_config.yield_vault,
        accumulated_c_after: vault_config.accumulated_c,
        acc_reward_per_share: yield_vault.acc_reward_per_share as u64,
        pending_rewards: ctx.accounts.referral_tracking.pending_rewards, 
        total_earned: ctx.accounts.referral_tracking.total_earned,
        total_fees_earnings: yield_vault.total_earned,
        creator_vault: vault_config.creator_vault,
        platform_vault: vault_config.platform_vault,
        referral_share_sol: referral_share_sol,
        token_reserve: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        position_id: args.position_id,
        pnl: if is_profit { pnl_difference as i64 } else { -(pnl_difference as i64) },
        exit_price: value_now,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
        pre_sale_acc_fee_per_share: token_config.pre_sale_acc_fee_per_share as u64,
        pre_sale_fee_sol: vault_config.pre_sale_vault,
    });

    Ok(())
}


#[event]
pub struct ClosePositionEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub repaid_tokens: u64,
    pub collateral_returned: u64,
    pub total_fees: u64,
    pub interest: u64,
    pub accumulated_c_after: i64,
    pub acc_reward_per_share: u64,
    pub pending_rewards: u64, 
    pub total_earned: u64,
    pub total_fees_earnings: u64,
    pub creator_vault: u64,
    pub platform_vault: u64,
    pub referral_share_sol: u64,
    pub token_reserve: u64,
    pub sol_reserve: u64, 
    pub position_id: u64,
    pub pnl: i64,
    pub exit_price: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub pre_sale_acc_fee_per_share: u64,
    pub pre_sale_fee_sol: u64,
}