use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
use crate::{VaultConfig, TokenConfig, Position, ErrorCode, ReferralVault, YieldVault};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;
use crate::get_price_from_vault;

pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct GoShortArgs {
    pub collateral_amount: u64,
    pub min_tokens_borrowed: u64,
    pub position_id: u64,
    pub collateral_percentage: u8,
    pub liquidation_price: u64,
}


#[derive(Accounts)]
#[instruction(args: GoShortArgs)]
pub struct GoShort<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(mut, constraint = user_collateral_account.mint == NATIVE_MINT_ID)]
    pub user_collateral_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: signer PDA
    pub temp_wsol_authority: AccountInfo<'info>,

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

    #[account(mut, seeds = [b"vault_config", mint.key().as_ref()], bump)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    pub token_config: Box<Account<'info, TokenConfig>>,

    /// CHECK: PDA authority for vaults
    #[account(
        seeds = [b"vault", vault_config.mint.as_ref()],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
    )]
    pub liquidity_sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = lending_vault.mint == token_config.mint,
    )]
    pub lending_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lending vault
    #[account(
        seeds = [b"vault_lending_authority", mint.key().as_ref()],
        bump,
    )]
    pub lending_vault_authority: AccountInfo<'info>,

    #[account(mut)]
    pub token_liquidity_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = user,
        seeds = [b"position", user.key().as_ref(), mint.key().as_ref(), &args.position_id.to_le_bytes()],
        bump,
        space = 8 + Position::LEN
    )]
    pub position: Box<Account<'info, Position>>,

    /// CHECK: PDA authority for referral
    #[account(
        seeds = [b"vault_referral_authority", referrer.key().as_ref()],
        bump,
    )]
    pub referral_vault_authority: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"vault_referral", referrer.key().as_ref()],
        bump,
        space = 8 + 32 + 8 + 8,
    )]
    pub referral_tracking: Box<Account<'info, ReferralVault>>,

    #[account(
        init_if_needed,
        payer = user,
        token::mint = wsol_mint,
        token::authority = referral_vault_authority,
        seeds = [b"vault_referral_token", referrer.key().as_ref()],
        bump,
    )]
    pub referral_token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Only used for seeds/validation
    pub referrer: UncheckedAccount<'info>,

    #[account(mut)]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn go_short(ctx: Context<GoShort>, args: GoShortArgs) -> Result<()> {
    let collateral_amount = args.collateral_amount;
    let min_tokens_borrowed = args.min_tokens_borrowed;
    let position_id = args.position_id;
    let collateral_percentage = args.collateral_percentage;
    let liquidation_price = args.liquidation_price;

    let token_config = &mut ctx.accounts.token_config;
    let vault_config = &mut ctx.accounts.vault_config;
    let now = Clock::get()?.unix_timestamp;

    msg!("collateral_amount: {}", collateral_amount);
    msg!("min_tokens_borrowed: {}", min_tokens_borrowed);
    msg!("position_id: {}", position_id);
    msg!("collateral_percentage: {}", collateral_percentage);
    msg!("liquidation_price: {}", liquidation_price);
    

    // Calculate fees
    let pre_sale_participants = token_config.pre_sale_participants;
    let mut pre_sale_fee_sol = 0u64;
    

    // --- Calculate the base creator fee (e.g. 0.5%) ---
    let mut creator_fee_sol = ((collateral_amount as u64)
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

    let mut platform_share_sol = ((collateral_amount as u64)
        .checked_mul(total_platform_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;


    let is_referral = ctx.accounts.referrer.key() != ctx.accounts.platform_vault.key();

    let referral_share_sol = if is_referral {
        let referral_fee = ((collateral_amount as u64)
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
    let yield_share_sol = ((collateral_amount as u64)
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

    // Sol amount after fees deducted
    let net_sol_to_liquidity = collateral_amount
        .checked_sub(total_fees_sol)
        .ok_or(ErrorCode::Underflow)?;
    msg!("net_sol_to_liquidity: {}", net_sol_to_liquidity);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_wsol_account.to_account_info(),
                to: ctx.accounts.project_vault.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        ),
        project_fees_sol,
    )?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_wsol_account.to_account_info(),
                to: ctx.accounts.platform_vault.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        ),
        platform_share_sol,
    )?;

    if referral_share_sol > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.temp_wsol_account.to_account_info(),
                    to: ctx.accounts.referral_token_vault.to_account_info(),
                    authority: ctx.accounts.temp_wsol_authority.to_account_info(),
                },
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

    // Transfer WSOL collateral from user to WSOL liquidity vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_wsol_account.to_account_info(),
                to: ctx.accounts.liquidity_sol_vault.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        ),
        net_sol_to_liquidity,
    )?;

    // Get current vault state before updates
    let token_reserve = vault_config.token_reserve;
    let sol_reserve = vault_config.sol_reserve;
    let accumulated_c = vault_config.accumulated_c;
    let virtual_sol = vault_config.virtual_sol;
    let virtual_tokens = vault_config.virtual_tokens;

    // --- Compute effective reserves ---
    // Combine SOL reserves safely (handles negative accumulated_c)
    let effective_sol_i128 = (sol_reserve as i128)
        .checked_add(accumulated_c as i128)
        .and_then(|s| s.checked_add(virtual_sol as i128))
        .ok_or(ErrorCode::Overflow)?;

    // Ensure result is not negative (since SOL reserves can't be negative)
    require!(effective_sol_i128 >= 0, ErrorCode::Underflow);

    let effective_sol_reserve = effective_sol_i128 as u64;

    // Combine token reserves with virtual liquidity
    let effective_token_reserve = token_reserve
        .checked_add(virtual_tokens)
        .ok_or(ErrorCode::Overflow)?;

    // --- Calculate tokens to borrow using bonding curve ---
    let divisor = 100u64
        .checked_div(collateral_percentage as u64)
        .ok_or(ErrorCode::DivisionByZero)?;

    let effective_input = net_sol_to_liquidity
        .checked_div(divisor)
        .ok_or(ErrorCode::DivisionByZero)?;

    // Apply standard bonding curve (constant product invariant)
    let numerator = (effective_token_reserve as u128)
        .checked_mul(effective_sol_reserve as u128)
        .ok_or(ErrorCode::Overflow)?;

    let denominator = (effective_sol_reserve as u128)
        .checked_add(effective_input as u128)
        .ok_or(ErrorCode::Overflow)?;

    let fraction = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::DivisionByZero)?;

    // Cast fraction back to u64 safely
    let fraction_u64 = u64::try_from(fraction).map_err(|_| ErrorCode::Overflow)?;

    // Tokens out = tokens borrowed
    let tokens_out = effective_token_reserve
        .checked_sub(fraction_u64)
        .ok_or(ErrorCode::Underflow)?;

    // --- Slippage check ---
    require!(
        tokens_out >= min_tokens_borrowed,
        ErrorCode::SlippageExceeded
    );


    // Transfer borrowed tokens from lending vault to token liquidity vault
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"vault_lending_authority",
        mint_key.as_ref(),
        &[ctx.bumps.lending_vault_authority],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lending_vault.to_account_info(),
                to: ctx.accounts.token_liquidity_vault.to_account_info(),
                authority: ctx.accounts.lending_vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        tokens_out,
    )?;

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

    msg!("updated acc reward per share: {}", yield_vault.acc_reward_per_share);

    // Update vault state
    vault_config.token_reserve = vault_config
        .token_reserve
        .checked_add(tokens_out)
        .ok_or(ErrorCode::Overflow)?;

    vault_config.creator_vault = vault_config
            .creator_vault
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 

    vault_config.platform_vault = vault_config
            .platform_vault
            .checked_add(platform_share_sol)
            .ok_or(ErrorCode::Overflow)?;

    yield_vault.total_earned = yield_vault
            .total_earned
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 

    vault_config.yield_vault = vault_config
            .yield_vault
            .checked_add(yield_share_sol as u64)
            .ok_or(ErrorCode::Overflow)?;
    msg!("updated yield vault share: {}", vault_config.yield_vault);

   
    // Recalculate to get entry price after everything
    let price = get_price_from_vault(
        vault_config.sol_reserve,
        vault_config.accumulated_c,
        vault_config.token_reserve,
        vault_config.virtual_sol,
        vault_config.virtual_tokens,
        ctx.accounts.mint.decimals,
    );
   msg!("price: {}", price);

    // Store short position
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.user.key();
    position.entry_price = price as u64;
    position.amount = tokens_out;
    position.mint = token_config.mint;
    position.open = true;
    position.collateral = net_sol_to_liquidity;
    position.liquidate = liquidation_price;
    position.position_id = position_id;
    position.created_at = Clock::get()?.unix_timestamp;


    //--- Close accounts ---
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

    emit!(ShortEvent {
        user: ctx.accounts.user.key(),
        collateral: net_sol_to_liquidity,
        borrowed_tokens:tokens_out,
        position_id: args.position_id,
        entry_price: price as u64,
        liquidation_price,
        pending_rewards: ctx.accounts.referral_tracking.pending_rewards, 
        total_earned: ctx.accounts.referral_tracking.total_earned,
        total_fees_earnings: yield_vault.total_earned,
        creator_vault: vault_config.creator_vault,
        platform_vault: vault_config.platform_vault,
        referral_share_sol: referral_share_sol,
        token_reserve: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        accumulated_c: vault_config.accumulated_c,
        mint: token_config.mint,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
        acc_reward_per_share: yield_vault.acc_reward_per_share as u64,
        pre_sale_acc_fee_per_share: token_config.pre_sale_acc_fee_per_share as u64,
        interest: vault_config.yield_vault,
        pre_sale_fee_sol: vault_config.pre_sale_vault,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct ShortEvent {
    pub user: Pubkey,
    pub collateral: u64,
    pub borrowed_tokens: u64,
    pub position_id: u64,
    pub entry_price: u64,
    pub liquidation_price: u64,
    pub pending_rewards: u64, 
    pub total_earned: u64,
    pub total_fees_earnings: u64,
    pub creator_vault: u64,
    pub platform_vault: u64,
    pub referral_share_sol: u64,
    pub token_reserve: u64,
    pub sol_reserve: u64,
    pub accumulated_c: i64,
    pub mint: Pubkey,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub acc_reward_per_share: u64,
    pub pre_sale_acc_fee_per_share: u64,
    pub interest: u64,
    pub pre_sale_fee_sol: u64,
    pub timestamp: i64,
}