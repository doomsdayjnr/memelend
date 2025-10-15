use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use crate::{VaultConfig, TokenConfig, Position, ErrorCode, YieldVault};



pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct LiquidatePositionArgs {
    pub position_id: u64,
}

#[derive(Accounts)]
#[instruction(args: LiquidatePositionArgs)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub bot: Signer<'info>,

    /// CHECK: This is the user's wallet that owned the position.
    /// We don't deserialize it because we only need it to return funds or close accounts.
    #[account(mut)]
    pub user: AccountInfo<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        close = user
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
    pub lending_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
    )]
    pub wsol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault_project", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = vault_authority,
    )]
    pub project_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub bot_wsol_account: Box<Account<'info, TokenAccount>>,

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

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn liquidate_position(ctx: Context<LiquidatePosition>, args: LiquidatePositionArgs) -> Result<()> {
    
    let position_id = args.position_id;

    let position = &ctx.accounts.position;


    // Check to see if positions matches correctly
    require!(
        position_id == position.position_id,
        ErrorCode::InvalidPositionId
    );

    let vault_config = &mut ctx.accounts.vault_config;
    let token_config = &mut ctx.accounts.token_config;
    let token_program = &ctx.accounts.token_program;
    let now = Clock::get()?.unix_timestamp;

    let borrowed_tokens = position.amount;

    let collateral_amount = position.collateral;

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

    let numerator = (borrowed_tokens as u128)
        .checked_mul(effective_sol_reserve as u128)
        .ok_or(ErrorCode::Overflow)?;

    // --- Combine token reserve with virtual tokens ---
    let effective_token_reserve = token_reserve
        .checked_add(virtual_tokens)
        .ok_or(ErrorCode::Overflow)?;

    let denominator = (effective_token_reserve as u128)
        .checked_add(borrowed_tokens as u128)
        .ok_or(ErrorCode::Overflow)?;

    let value_now_u128 = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::DivisionByZero)?;
 

    let value_now = u64::try_from(value_now_u128).map_err(|_| ErrorCode::Overflow)?;


    // === Calculate Liquidator Reward (Hybrid Model) ===
    let liquidator_fee_bps: u64 = 100; // 1%
    let yield_cut_bps = 50; // 0.5%

    let percent_fee = collateral_amount
        .checked_mul(liquidator_fee_bps)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10_000) // BPS divisor
        .ok_or(ErrorCode::Overflow)?;

    // --- Compute yield share ---
    let yield_share_sol = ((collateral_amount as u64)
        .checked_mul(yield_cut_bps)
        .ok_or(ErrorCode::Overflow)? / 10_000) as u64;

    let total_fees_sol = percent_fee
        .checked_add(yield_share_sol)
        .ok_or(ErrorCode::Overflow)?;

    let adjusted_collateral_after_fee = collateral_amount
        .checked_sub(total_fees_sol)
        .ok_or(ErrorCode::Underflow)?;


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
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        b"vault_wsol_authority",
        mint_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[signer_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.wsol_vault.to_account_info(),
                to: ctx.accounts.project_vault.to_account_info(),
                authority: ctx.accounts.wsol_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        yield_share_sol,
    )?;

    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.wsol_vault.to_account_info(),
                to: ctx.accounts.bot_wsol_account.to_account_info(), // Bot's WSOL account
                authority: ctx.accounts.wsol_vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        percent_fee,
    )?;

    // Forfeit collateral to protocol (leave in WSOL vault)
    // No transfer needed — WSOL is already in vault.

    let position = &mut ctx.accounts.position;
    position.open = false;

    vault_config.token_reserve = vault_config
        .token_reserve
        .checked_sub(borrowed_tokens)
        .ok_or(ErrorCode::Underflow)?;

    vault_config.accumulated_c = vault_config.accumulated_c
        .checked_add(adjusted_collateral_after_fee as i64) // Convert to i64 before adding
        .ok_or(ErrorCode::Overflow)?;

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

        // Optional: update timestamp
        yield_vault.last_accrual_ts = now;
    }

    vault_config.yield_vault = vault_config
            .yield_vault
            .checked_add(yield_share_sol)
            .ok_or(ErrorCode::Overflow)?; 

    
    emit!(LiquidatePositionEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        position_id: position.position_id,
        repaid_tokens: borrowed_tokens,
        total_fees: percent_fee,
        interest: vault_config.yield_vault,
        forfeited_collateral: adjusted_collateral_after_fee,
        accumulated_c_after: vault_config.accumulated_c,
        acc_reward_per_share: yield_vault.acc_reward_per_share as u64,
        token_reserve_after: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
        exit_price: value_now,
    });

    Ok(())
}

#[event]
pub struct LiquidatePositionEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub position_id: u64,
    pub repaid_tokens: u64,
    pub total_fees: u64,
    pub interest: u64,
    pub forfeited_collateral: u64,
    pub accumulated_c_after: i64,
    pub acc_reward_per_share: u64,
    pub token_reserve_after: u64,
    pub sol_reserve: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub exit_price: u64,
}
