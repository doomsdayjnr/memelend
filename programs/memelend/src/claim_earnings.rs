use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount, Mint};
use crate::{ YieldVault, ErrorCode, VaultConfig};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;



#[derive(Accounts)]
pub struct ClaimEarnings<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    #[account(mut)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = temp_wsol_account.mint == NATIVE_MINT_ID @ ErrorCode::InvalidWsolMint,
    )]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,
    
    #[account(mut)]
    pub project_vault: Account<'info, TokenAccount>, 
    
    /// CHECK: PDA
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn claim_earnings(ctx: Context<ClaimEarnings>) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let vault_config = &mut ctx.accounts.vault_config;
    let now_ts = Clock::get()?.unix_timestamp;

    // Check to see if the User requesting is the creator of the token
    require!(
        vault.creator == ctx.accounts.user.key(),
        ErrorCode::Unauthorized
    );

    // Check to see if this is the correct mint address
    require!(
        vault.mint == ctx.accounts.mint.key(),
        ErrorCode::InvalidToken
    );


    // Get creator vault current balance
       let amount = vault_config.creator_vault;

   
    // Transfer amount from Creator Vault -> User
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
        amount as u64,
    )?;

    // Update creator_vault
    vault_config.creator_vault = vault_config.creator_vault.checked_sub(amount as u64).unwrap();

    emit!(ClaimEarningsEvent {
        owner: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        creator_vault: vault_config.creator_vault,
        amount_withdrew: amount as u64,
        total_earned: vault.total_earned,
        timestamp: now_ts,
    });

    Ok(())
}

#[event]
pub struct ClaimEarningsEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub creator_vault: u64,
    pub amount_withdrew: u64,
    pub total_earned: u64,
    pub timestamp: i64,
}