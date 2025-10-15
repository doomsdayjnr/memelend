use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount, Mint};
use crate::{ YieldVault, ErrorCode, UserYieldPosition};


pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math
pub const SECONDS_IN_YEAR: u64 = 31_536_000; // 365 days

// Helper function for Dynamic withdrawal curve for creators staked token
fn allowed_withdraw_percent(elapsed_days: i64) -> u16 {
    if elapsed_days < 7 {
        0
    } else if elapsed_days < 30 {
        1000 // 10% (bps)
    } else if elapsed_days < 180 {
        5000 // 50%
    } else {
        10000 // 100%
    }
}

#[derive(Accounts)]
pub struct CreatorWithdrawYield<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(mut)]
    pub user_yield_position: Account<'info, UserYieldPosition>,

    #[account(mut)]
    pub lending_vault: Box<Account<'info, TokenAccount>>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    pub mint: Account<'info, Mint>,

    /// CHECK: PDA authority for vaults
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,

    #[account(mut)]
    pub project_vault: Account<'info, TokenAccount>, 

    /// CHECK: PDA authority for lending vault
    #[account(
        seeds = [b"vault_lending_authority", mint.key().as_ref()],
        bump,
    )]
    pub lending_vault_authority: AccountInfo<'info>,

    #[account(mut)]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn creator_yield_withdrawal(
    ctx: Context<CreatorWithdrawYield>,
    amount: u64,
    position_id: u64
) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let user_position = &mut ctx.accounts.user_yield_position;
    let now_ts = Clock::get()?.unix_timestamp;
    let mut is_initial_deposit = false;

    // Check deposited vs amount
    require!(amount <= user_position.deposited, ErrorCode::InsufficientBalance);

    
    // Handle initial vs secondary deposits
    if position_id == user_position.position_id {
        // Initial deposit → apply dynamic withdrawal curve
        let elapsed_days = (now_ts - vault.launch_ts) / 86400;
        let allowed_bps = allowed_withdraw_percent(elapsed_days);

        let max_withdrawable = (user_position.initial_deposit as u128)
            .checked_mul(allowed_bps as u128)
            .unwrap()
            / 10_000u128;

        let available_to_creator = if user_position.claimed_principal >= max_withdrawable as u64 {
            0
        } else {
            max_withdrawable as u64 - user_position.claimed_principal
        };

        require!(amount <= available_to_creator, ErrorCode::CreatorOverWithdrawal);

        // Increment claimed_principal only for initial deposit
        user_position.claimed_principal = user_position
            .claimed_principal
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        is_initial_deposit= true;
    }
    // Secondary deposits → no curve, no claimed_principal increment

 
    // Calculate user pending rewards
    let pending = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION
        - user_position.reward_debt;
    
    msg!("pending: {}", pending);

    if pending > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.project_vault.to_account_info(),
            to: ctx.accounts.temp_wsol_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(), // PDA authority
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds = &[
            b"vault",
            mint_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];

        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[signer_seeds]),
            pending as u64,
        )?;

        user_position.claimed_total = user_position.claimed_total
            .checked_add(pending as u64)
            .unwrap();
    }



    // Transfer principal tokens back to user
    let cpi_accounts = Transfer {
        from: ctx.accounts.lending_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.lending_vault_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();

    let mint_key = ctx.accounts.mint.key();
    let vault_seeds = &[
        b"vault_lending_authority",
        mint_key.as_ref(),
        &[ctx.bumps.lending_vault_authority],
    ];

    token::transfer(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, &[vault_seeds]),
        amount,
    )?;

   
    // Update user deposited and vault total_staked
    user_position.deposited = user_position.deposited
        .checked_sub(amount)
        .unwrap();
    vault.total_staked = vault.total_staked
        .checked_sub(amount)
        .unwrap();


    // Update user reward debt
    user_position.reward_debt = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION;

    user_position.last_action_ts = now_ts;
    vault.last_accrual_ts = now_ts;


    emit!(CreatorYieldWithdrawalEvent {
        owner: user_position.owner,
        mint: ctx.accounts.mint.key(),
        position_id,
        claimed_principal: user_position.claimed_principal,
        claimed_rewards: pending as u64,
        total_staked: vault.total_staked,
        reward_debt: user_position.reward_debt as u64,
        claimed_total: user_position.claimed_total,
        remaining_deposit: user_position.deposited,
        amount_withdraw: amount,
        is_initial_deposit,
        ts: now_ts,
    });

    Ok(())
}

#[event]
pub struct CreatorYieldWithdrawalEvent {
    pub owner: Pubkey,        
    pub mint: Pubkey,
    pub position_id: u64, 
    pub claimed_principal: u64,                
    pub claimed_rewards: u64,
    pub claimed_total: u64,
    pub reward_debt: u64,
    pub total_staked: u64,   
    pub remaining_deposit: u64,
    pub amount_withdraw: u64,
    pub is_initial_deposit: bool, 
    pub ts: i64,              
}
