use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount, Mint};
use crate::{ YieldVault, ErrorCode, UserYieldPosition};



pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math
pub const SECONDS_IN_YEAR: u64 = 31_536_000; // 365 days

#[derive(Accounts)]
pub struct WithdrawYield<'info> {
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

pub fn withdraw_yield(ctx: Context<WithdrawYield>, amount: u64, position_id: u64) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let user_position = &mut ctx.accounts.user_yield_position;
    let now_ts = Clock::get()?.unix_timestamp;

    msg!("amount: {}", amount);
    msg!("deposited: {}", user_position.deposited);

    // Check to see if the user is the creator of the token
    require!(!user_position.is_creator, ErrorCode::CreatorCannotWithdrawHere);

    // Check deposit value vs amount
    require!(amount <= user_position.deposited, ErrorCode::InsufficientBalance);

    // Calculate user pending rewards
    let pending = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION
        - user_position.reward_debt;

    // If positive balance it will transfer the rewards and set pending rewards to zero
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


        // Transfer pending rewards to user or update claimed_total
        user_position.claimed_total = user_position.claimed_total.checked_add(pending as u64).unwrap();
        // (Optionally implement CPI transfer from Interest Vault here)
    }

   
    // Transfer principal tokens back to user
    let cpi_accounts = Transfer {
        from: ctx.accounts.lending_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.lending_vault_authority.to_account_info(), // if PDA
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();

    // Use seeds if vault is a PDA
    let mint_key = ctx.accounts.mint.key();
    let vault_seeds = &[
        b"vault_lending_authority",
        mint_key.as_ref(),
        &[ctx.bumps.lending_vault_authority],
    ];
    let signer = &[&vault_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer),
        amount,
    )?;


    // Update user deposited and vault total_staked
    user_position.deposited = user_position.deposited.checked_sub(amount).unwrap();
    vault.total_staked = vault.total_staked.checked_sub(amount).unwrap();

 
    // Update user reward debt
    user_position.reward_debt = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION;
    user_position.last_action_ts = now_ts;

    vault.last_accrual_ts = now_ts;

    emit!(WithdrawYieldEvent {
        owner: user_position.owner,
        mint: ctx.accounts.mint.key(),
        position_id: position_id,
        claimed_principal: amount,
        claimed_amount: pending as u64,
        remaining_deposited: user_position.deposited,
        reward_debt: user_position.reward_debt as u64,
        total_staked: vault.total_staked,
        claimed_total: user_position.claimed_total,
        last_action_ts: now_ts,
    });

    Ok(())
}


#[event]
pub struct WithdrawYieldEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub position_id: u64,
    pub claimed_principal: u64,
    pub claimed_amount: u64,
    pub remaining_deposited: u64,
    pub reward_debt: u64,
    pub total_staked: u64,
    pub claimed_total: u64,
    pub last_action_ts: i64,
}