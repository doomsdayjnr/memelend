use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;
use crate::{VaultConfig, TokenConfig, ReferralVault, ErrorCode, YieldVault};
use crate::get_price_from_vault;

pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyTokenArgs {
    pub sol_amount: u64,
    pub min_tokens_out: u64,
    pub position_id: u64,
}

#[derive(Accounts)]
pub struct BuyToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        address = token_config.mint, // Ensures this matches your token config
        constraint = liquidity_token_vault.mint == mint.key() @ ErrorCode::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
    mut,
    constraint = temp_wsol_account.mint == NATIVE_MINT_ID @ ErrorCode::InvalidWsolMint,
    )]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: This authority is validated against the user key in the function
    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub liquidity_token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_liquidity_authority", mint.key().as_ref()],
        bump,
    )]
    pub liquidity_vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
    )]
    pub liquidity_sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(mut)]
    pub token_config: Box<Account<'info, TokenConfig>>,

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
    
    /// CHECK: This is a PDA derived from [b"vault", mint] and only used as a signer in token transfer CPI. No data access occurs.
    #[account(
        mut,
        seeds = [b"vault", vault_config.mint.as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

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

    /// CHECK: Only used for seeds/validation
    pub referrer: UncheckedAccount<'info>,

    #[account(mut)]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn buy_token(ctx: Context<BuyToken>, args: BuyTokenArgs) -> Result<()> {
    let sol_amount = args.sol_amount;
    let min_tokens_out = args.min_tokens_out;
    let _position_id = args.position_id;

    let token_config = &mut ctx.accounts.token_config;
    let vault_config = &mut ctx.accounts.vault_config;
    let now = Clock::get()?.unix_timestamp;

    msg!("sol_amount: {}", sol_amount);
    msg!("min_tokens_out: {}", min_tokens_out);
    msg!("_position_id: {}", _position_id);

     // --- Checks to see if Temp account is WSOL ---
    require!(
        ctx.accounts.temp_wsol_account.mint == NATIVE_MINT_ID,
        ErrorCode::InvalidWsolMint
    );

    // --- Checks to see if temp account value is greater or equal SOL amount ---
    require!(
        ctx.accounts.temp_wsol_account.amount >= args.sol_amount,
        ErrorCode::InsufficientFunds
    );

    // --- Checks to see if SOL Reserve is more than 0.1 SOL ---
    require!(
        vault_config.sol_reserve >= 100_000_000, // 0.1 SOL
        ErrorCode::InsufficientLiquidity
    );

    require!(
        vault_config.token_reserve >= 100_000 * 10u64.pow(ctx.accounts.mint.decimals as u32),
        ErrorCode::InsufficientLiquidity
    );

    // === FLASH LOAN PROTECTION: TRADE COOLDOWN CHECK ===
    let clock = Clock::get()?;
    let last_trade_timestamp = vault_config.last_trade_timestamp;

    // Prevent rapid successive trades (1 second cooldown)
    // Allow first trade (timestamp == 0) or trades after cooldown period
    if last_trade_timestamp > 0 {
        require!(
            clock.unix_timestamp - last_trade_timestamp >= 1,
            ErrorCode::TradeCooldown
        );
    }

    // Update timestamp for the next trade
    vault_config.last_trade_timestamp = clock.unix_timestamp;
    // === END FLASH LOAN PROTECTION ===

    let price = get_price_from_vault(
        vault_config.sol_reserve,
        vault_config.accumulated_c,
        vault_config.token_reserve,
        vault_config.virtual_sol,
        vault_config.virtual_tokens,
        ctx.accounts.mint.decimals,
    );

    msg!("price: {}", price);


    require!(
        price >= 100_000, // Minimum 0.000001 SOL per token
        ErrorCode::InvalidPrice
    );

    if ctx.accounts.referral_tracking.to_account_info().data_is_empty() {
        ctx.accounts.referral_tracking.referrer = ctx.accounts.referrer.key();
        ctx.accounts.referral_tracking.pending_rewards = 0;
        ctx.accounts.referral_tracking.total_earned = 0;
    }

    // Calculate fees
    let pre_sale_participants = token_config.pre_sale_participants;
    msg!("pre_sale_participants: {}", pre_sale_participants);
    let mut pre_sale_fee_sol = 0u64;
    

    // --- Calculate the base creator fee (e.g. 0.5%) ---
    let mut creator_fee_sol = ((sol_amount as u64)
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

    let mut platform_share_sol = ((sol_amount as u64)
        .checked_mul(total_platform_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;


    let is_referral = ctx.accounts.referrer.key() != ctx.accounts.platform_vault.key();

    let referral_share_sol = if is_referral {
        let referral_fee = ((sol_amount as u64)
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
    let yield_share_sol = ((sol_amount as u64)
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

    // End Calculate fees

    // --- Subtract total fees from SOL amount to get net to liquidity ---
    let net_sol_to_liquidity = sol_amount
        .checked_sub(total_fees_sol)
        .ok_or(ErrorCode::Underflow)?;
    msg!("net_sol_to_liquidity: {}", net_sol_to_liquidity);

    let denominator = (vault_config.sol_reserve as i128)
        .checked_add(vault_config.virtual_sol as i128)
        .and_then(|sum| sum.checked_add(vault_config.accumulated_c as i128))
        .and_then(|sum| sum.checked_add(net_sol_to_liquidity as i128))
        .and_then(|sum| u64::try_from(sum).ok())
        .ok_or(ErrorCode::Overflow)?;


    let effective_token_reserve = vault_config.virtual_tokens as u128
    + vault_config.token_reserve as u128;
    

    let numerator = (net_sol_to_liquidity as u128)
        .checked_mul(effective_token_reserve)
        .ok_or(ErrorCode::Overflow)?;
  

    let token_out = numerator
        .checked_div(denominator as u128)
        .ok_or(ErrorCode::Overflow)? as u64;

    msg!("token_out: {}", token_out);


    // Slippage check
    require!(
        token_out >= min_tokens_out,
        ErrorCode::SlippageExceeded
    );
    // Cap maximum purchase at 20% of pool
    let max_allowed = vault_config.token_reserve.checked_div(5)
        .ok_or(ErrorCode::Overflow)?;

    require!(
        token_out <= max_allowed,
        ErrorCode::AmountTooLarge
    );

    // Transfer project fees to project vault
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

    // Transfer Platform fees to Platform vault
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

    // If Referral exist then it transfers referral fees to referral vault
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

        // If true it updates total earned
        ctx.accounts.referral_tracking.total_earned = ctx
        .accounts
        .referral_tracking
        .total_earned
        .checked_add(referral_share_sol)
        .ok_or(ErrorCode::Overflow)?;
    }

    msg!("updated total earnings referral: {}", ctx.accounts.referral_tracking.total_earned);

    // Transfers the remaining SOL amount after deductions to the Liquidity vault
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

    let bump = ctx.bumps.liquidity_vault_authority; 
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        b"vault_liquidity_authority",
        mint_key.as_ref(), 
        &[bump],
    ];
    let signer_seeds = &[signer_seeds];

    //Transfers the tokens to the users wallet
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidity_token_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.liquidity_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        token_out,
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


    // --- Update SOL reserves ---
    vault_config.sol_reserve = vault_config.sol_reserve
        .checked_add(net_sol_to_liquidity)
        .ok_or(ErrorCode::Overflow)?;

    msg!("updated sol reserve: {}", vault_config.sol_reserve);

    // --- Update Token reserves ---
    vault_config.token_reserve = vault_config.token_reserve
        .checked_sub(token_out)
        .ok_or(ErrorCode::Underflow)?;

    msg!("updated token reserve: {}", vault_config.token_reserve);

    // --- Update Project fees calculation ---
    vault_config.creator_vault = vault_config
            .creator_vault
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 
    msg!("updated Creator vault share: {}", vault_config.creator_vault);

    // --- Update Creators Total Earnings ---
    yield_vault.total_earned = yield_vault
            .total_earned
            .checked_add(creator_fee_sol)
            .ok_or(ErrorCode::Overflow)?; 
    msg!("updated creator total earned vault share: {}", yield_vault.total_earned);

     // --- Update Platform fees Stats ---
    vault_config.platform_vault = vault_config
            .platform_vault
            .checked_add(platform_share_sol)
            .ok_or(ErrorCode::Overflow)?;
    msg!("updated platform vault share: {}", vault_config.platform_vault);

    vault_config.yield_vault = vault_config
            .yield_vault
            .checked_add(yield_share_sol as u64)
            .ok_or(ErrorCode::Overflow)?;
    msg!("updated yield vault share: {}", vault_config.yield_vault);

     // --- Calculate the entry price after everything has gone through ---
    let entry_price = get_price_from_vault(
        vault_config.sol_reserve,
        vault_config.accumulated_c,
        vault_config.token_reserve,
        vault_config.virtual_sol,
        vault_config.virtual_tokens,
        ctx.accounts.mint.decimals,
    );
    msg!("entry_price: {}", entry_price);

    //--- Close Temp accounts ---
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


    emit!(BuyEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        position_id: args.position_id,
        entry_price: entry_price as u64,
        sol_in: net_sol_to_liquidity,
        tokens_out: token_out,
        pending_rewards: ctx.accounts.referral_tracking.pending_rewards, 
        total_earned: ctx.accounts.referral_tracking.total_earned,
        total_fees_earnings: yield_vault.total_earned,
        creator_vault: vault_config.creator_vault,
        platform_vault: vault_config.platform_vault,
        referral_share_sol: referral_share_sol,
        token_reserve: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        accumulated_c: vault_config.accumulated_c,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
        acc_reward_per_share: yield_vault.acc_reward_per_share as u64,
        pre_sale_acc_fee_per_share: token_config.pre_sale_acc_fee_per_share as u64,
        interest: vault_config.yield_vault,
        pre_sale_fee_sol: vault_config.pre_sale_vault,
        vault_bump: bump,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}


#[event]
pub struct BuyEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub position_id: u64,
    pub entry_price: u64,
    pub sol_in: u64,
    pub tokens_out: u64,
    pub pending_rewards: u64, 
    pub total_earned: u64,
    pub total_fees_earnings: u64,
    pub creator_vault: u64,
    pub platform_vault: u64,
    pub referral_share_sol: u64,
    pub token_reserve: u64,
    pub sol_reserve: u64, 
    pub accumulated_c: i64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub acc_reward_per_share: u64,
    pub pre_sale_acc_fee_per_share: u64,
    pub interest: u64,
    pub pre_sale_fee_sol: u64,
    pub vault_bump: u8,
    pub timestamp: i64,
}
