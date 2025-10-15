use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;
use crate::{VaultConfig, TokenConfig, ReferralVault, ErrorCode, YieldVault};
use crate::get_price_from_vault;

pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SellTokenArgs {
    pub token_amount: u64,
    pub min_sol_out: u64,
    pub position_id: u64,
}

#[derive(Accounts)]
pub struct SellToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        address = token_config.mint,
        constraint = liquidity_token_vault.mint == mint.key() @ ErrorCode::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = temp_wsol_account.mint == NATIVE_MINT_ID @ ErrorCode::InvalidWsolMint,
    )]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,

    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = user_token_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = liquidity_token_vault.mint == mint.key() @ ErrorCode::InvalidMint,
    )]
    pub liquidity_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = wsol_mint,
        constraint = liquidity_sol_vault.key() == token_config.wsol_liquidity_vault @ ErrorCode::InvalidVault
    )]
    pub liquidity_sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(mut)]
    pub token_config: Box<Account<'info, TokenConfig>>,

    #[account(
        mut,
        token::mint = wsol_mint,
    )]
    pub project_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = wsol_mint,
    )]
    pub platform_vault: Box<Account<'info, TokenAccount>>,

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
    pub referral_tracking: Account<'info, ReferralVault>,

    #[account(
        init_if_needed,
        payer = user,
        token::mint = wsol_mint,
        token::authority = referral_vault_authority,
        seeds = [b"vault_referral_token", referrer.key().as_ref()],
        bump,
    )]
    pub referral_token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: This is a PDA derived from [b"vault", mint] and only used as a signer in token transfer CPI. No data access occurs.
    #[account(
        mut,
        seeds = [b"vault", vault_config.mint.as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: Only used for seeds/validation
    pub referrer: UncheckedAccount<'info>,

    /// CHECK: PDA for wSOL vault authority
    #[account(
        seeds = [b"vault_wsol_authority", mint.key().as_ref()],
        bump,
    )]
    pub wsol_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn sell_token(ctx: Context<SellToken>, args: SellTokenArgs) -> Result<()> {
    
    let token_amount = args.token_amount;
    let min_sol_out = args.min_sol_out;
    let position_id = args.position_id;
    msg!("token_amount: {}", token_amount);
    msg!("min_sol_out: {}", min_sol_out);
    msg!("position_id: {}", position_id);

    let token_config = &mut ctx.accounts.token_config;
    let vault_config = &mut ctx.accounts.vault_config;
    let now = Clock::get()?.unix_timestamp;
  
    // Validate input amounts
    require!(token_amount > 0, ErrorCode::ZeroInput);

    // Check to see if User balance is greater or equal to token amount requested
    require!(
        ctx.accounts.user_token_account.amount >= token_amount,
        ErrorCode::InsufficientFunds
    );

    // Checks to see if there is enough Sol reserves and its greater than zero
    require!(
        vault_config.sol_reserve > 0,
        ErrorCode::InsufficientLiquidity
    );

    // === FLASH LOAN PROTECTION: TRADE COOLDOWN CHECK ===
    let clock = Clock::get()?;
    let last_trade_timestamp = vault_config.last_trade_timestamp;

    if last_trade_timestamp > 0 {
        require!(
            clock.unix_timestamp - last_trade_timestamp >= 1,
            ErrorCode::TradeCooldown
        );
    }

    vault_config.last_trade_timestamp = clock.unix_timestamp;
    // === END FLASH LOAN PROTECTION ===

    // Combine SOL reserves safely (handles negative accumulated_c)
    let effective_sol_i128 = (vault_config.sol_reserve as i128)
        .checked_add(vault_config.accumulated_c as i128)
        .and_then(|s| s.checked_add(vault_config.virtual_sol as i128))
        .ok_or(ErrorCode::Overflow)?;

    // Ensure result is not negative (since SOL reserves can't be negative)
    require!(effective_sol_i128 >= 0, ErrorCode::Underflow);

    let effective_sol = effective_sol_i128 as u64;

    // Tokens are always unsigned
    let effective_tokens = vault_config
        .token_reserve
        .checked_add(vault_config.virtual_tokens)
        .ok_or(ErrorCode::Overflow)?;

    // Constant product invariant
    let k = (effective_sol as u128)
        .checked_mul(effective_tokens as u128)
        .ok_or(ErrorCode::Overflow)?;

    // After tokens are sold back to pool
    let new_token_reserve = effective_tokens
        .checked_add(token_amount)
        .ok_or(ErrorCode::Overflow)?;

    // New SOL reserve (u128 division)
    let new_sol_reserve = k
        .checked_div(new_token_reserve as u128)
        .ok_or(ErrorCode::Overflow)? as u64;

    // Gross SOL returned to user
    let gross_sol_out = effective_sol
        .checked_sub(new_sol_reserve)
        .ok_or(ErrorCode::Underflow)?;

    msg!("gross_sol_out: {}", gross_sol_out);

    // Checks to see if the SOL vault has enough to pay the User
    require!(
        ctx.accounts.liquidity_sol_vault.amount >= gross_sol_out,
        ErrorCode::InsufficientLiquidity
    );

    // Computes all the fees logic here below
    let pre_sale_participants = token_config.pre_sale_participants;
    let mut pre_sale_fee_sol = 0u64;
    

    // Computes the base creator fee (e.g. 0.5%)
    let mut creator_fee_sol = ((gross_sol_out as u64)
        .checked_mul(token_config.creator_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;
    msg!("creator_fee_sol: {}", creator_fee_sol);

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

    let mut platform_share_sol = ((gross_sol_out as u64)
        .checked_mul(total_platform_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;
    msg!("platform_share_sol: {}", platform_share_sol);

    // Check to see if the referrer key matches the platform vault key
    let is_referral = ctx.accounts.referrer.key() != ctx.accounts.platform_vault.key();

    // If the above statement is true then it will compute the referral fees else false it will skip and set yield share to 0.2% instead of the 0.1% it usually gets.
    let referral_share_sol= if is_referral {
        let referral_fee = ((gross_sol_out as u64)
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

    msg!("referral pending_rewards: {}", ctx.accounts.referral_tracking.pending_rewards);
   

    //Compute yield share
    let yield_share_sol = ((gross_sol_out as u64)
        .checked_mul(yield_cut_bps)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;

    //Adjust final platform share 
    platform_share_sol = platform_share_sol
        .checked_sub(yield_share_sol)
        .ok_or(ErrorCode::Underflow)?;
    msg!("platform_share_sol: {}", platform_share_sol);
    msg!("yield_share_sol: {}", yield_share_sol);
    msg!("referral_share_sol: {}", referral_share_sol);

    // Sum all fee components safely
    let total_fees_sol = creator_fee_sol
        .checked_add(platform_share_sol)
        .and_then(|v| v.checked_add(referral_share_sol))
        .and_then(|v| v.checked_add(yield_share_sol))
        .and_then(|v| v.checked_add(pre_sale_fee_sol))
        .ok_or(ErrorCode::Overflow)?;
    msg!("total_fees_sol: {}", total_fees_sol);

    // Compute the total fees that needs to be added to the project vault
    let project_fees_sol = creator_fee_sol
        .checked_add(yield_share_sol)
        .and_then(|v| v.checked_add(pre_sale_fee_sol))
        .ok_or(ErrorCode::Overflow)?;
    msg!("project_fees_sol: {}", project_fees_sol);

    // End Compute fees

    // Subtract total fees from SOL amount to get net sol payout amount
    let net_sol_out = gross_sol_out
        .checked_sub(total_fees_sol)
        .ok_or(ErrorCode::Underflow)?;

    msg!("net_sol_out: {}", net_sol_out);

    // Slippage check
    require!(
        net_sol_out >= min_sol_out,
        ErrorCode::SlippageExceeded
    );

    // Anti-whale check
    let max_allowed_tokens = vault_config.token_reserve.checked_div(5)
        .ok_or(ErrorCode::Overflow)?;

    require!(
        token_amount <= max_allowed_tokens,
        ErrorCode::AmountTooLarge
    );

    // Transfer tokens from user to liquidity vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.liquidity_token_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // Prepare PDA signature for wSOL transfers
    let bump = ctx.bumps.wsol_vault_authority;
    let signer_seeds: &[&[u8]] = &[
        b"vault_wsol_authority",
        vault_config.mint.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[signer_seeds];

    // Transfer fees SOL to Creator
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

    // Transfer fees SOL to Platform
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

    //If true Transfer fees SOL to Referral
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

        // Updates and tracks the total earning for the referral user 
        ctx.accounts.referral_tracking.total_earned = ctx
            .accounts
            .referral_tracking
            .total_earned
            .checked_add(referral_share_sol)
            .ok_or(ErrorCode::Overflow)?;
    }

     msg!("referral total_earned: {}", ctx.accounts.referral_tracking.total_earned);

    // Transfer User the remaining balance of SOL
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
        net_sol_out,
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

    msg!("yield acc reward per share: {}", yield_vault.acc_reward_per_share);

    // Increases the token reserves
    vault_config.token_reserve = vault_config.token_reserve
        .checked_add(token_amount)
        .ok_or(ErrorCode::Overflow)?;
    msg!("token_reserve: {}", vault_config.token_reserve);

    // Decreases the sol reserves 
    vault_config.sol_reserve = vault_config.sol_reserve
        .checked_sub(gross_sol_out)
        .ok_or(ErrorCode::Underflow)?;
    msg!("sol_reserve: {}", vault_config.sol_reserve);

    //Tracks and increases the creators current balance for earnings
    vault_config.creator_vault = vault_config
            .creator_vault
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 
    msg!("creator_vault: {}", vault_config.creator_vault);

    //Tracks and increases the creators current balance for earnings
    vault_config.platform_vault = vault_config
            .platform_vault
            .checked_add(platform_share_sol)
            .ok_or(ErrorCode::Overflow)?;
    msg!("platform_vault: {}", vault_config.platform_vault);

    //Tracking the creators total earning for the token over time.
   yield_vault.total_earned = yield_vault
            .total_earned
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?;
    msg!("creator total_earned tracking: {}", yield_vault.total_earned);

    //Tracking the yield vault balance
    vault_config.yield_vault = vault_config
            .yield_vault
            .checked_add(yield_share_sol as u64)
            .ok_or(ErrorCode::Overflow)?; 
    msg!("yield vault current balance: {}", vault_config.yield_vault);

    // Computes the exit price after everything
    let exit_price = get_price_from_vault(
        vault_config.sol_reserve,
        vault_config.accumulated_c,
        vault_config.token_reserve,
        vault_config.virtual_sol,
        vault_config.virtual_tokens,
        ctx.accounts.mint.decimals,
    );
    msg!("exit_price: {}", exit_price);

    // Close temporary wSOL account
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

    emit!(SellEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        position_id: args.position_id,
        tokens_in: token_amount,
        sol_out: net_sol_out,
        exit_price:exit_price,
        token_reserve: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        accumulated_c: vault_config.accumulated_c,
        pending_rewards: ctx.accounts.referral_tracking.pending_rewards, 
        total_earned: ctx.accounts.referral_tracking.total_earned,
        total_fees_earnings: yield_vault.total_earned,
        creator_vault: vault_config.creator_vault,
        platform_vault: vault_config.platform_vault,
        referral_share_sol: referral_share_sol,
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
pub struct SellEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub position_id: u64,
    pub tokens_in: u64,
    pub sol_out: u64,
    pub exit_price: u64,
    pub token_reserve: u64,
    pub sol_reserve: u64,
    pub accumulated_c: i64,
    pub pending_rewards: u64, 
    pub total_earned: u64,
    pub total_fees_earnings: u64,
    pub creator_vault: u64,
    pub platform_vault: u64,
    pub referral_share_sol: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub acc_reward_per_share: u64,
    pub pre_sale_acc_fee_per_share: u64,
    pub interest: u64,
    pub pre_sale_fee_sol: u64,
    pub timestamp: i64,
}

