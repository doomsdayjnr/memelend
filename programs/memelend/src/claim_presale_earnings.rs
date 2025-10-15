use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount, Mint};
use crate::{ YieldVault, ErrorCode, UserPreSalePosition, TokenConfig};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;


pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math

#[derive(Accounts)]
pub struct ClaimPresaleRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(mut)]
    pub token_config: Box<Account<'info, TokenConfig>>,

    #[account(mut)]
    pub user_presale_position: Box<Account<'info, UserPreSalePosition>>,

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

pub fn claim_presale_rewards(ctx: Context<ClaimPresaleRewards>) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let user_position = &mut ctx.accounts.user_presale_position;
    let token_config = &mut ctx.accounts.token_config;
    let now_ts = Clock::get()?.unix_timestamp;

    // Check to see if the user is the owner
    require!(
        user_position.user == ctx.accounts.user.key(),
        ErrorCode::Unauthorized
    );

    // Check to see if the mint address matches
    require!(
        user_position.mint == ctx.accounts.mint.key(),
        ErrorCode::InvalidMintForUserPosition
    );

  
    // Calculate presale user pending rewards
    let pending = (user_position.initial_bought as u128)
        .checked_mul(token_config.pre_sale_acc_fee_per_share)
        .unwrap()
        / PRECISION
        - user_position.fee_debt;

   
    // Checks to see if the User has rewards available
    require!(pending > 0, ErrorCode::NoRewardsAvailable);

    // Transfer pending rewards from Interest Vault -> User
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

 
    //  Update user fee debt and claimed_total
    user_position.fee_debt = (user_position.initial_bought as u128)
        .checked_mul(token_config.pre_sale_acc_fee_per_share)
        .unwrap()
        / PRECISION;
    user_position.claimed_total = user_position.claimed_total.checked_add(pending as u64).unwrap();
    user_position.last_action_ts = now_ts;

    vault.last_accrual_ts = now_ts;

    emit!(ClaimPresaleFeesRewardsEvent {
        owner: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        claimed_amount: pending as u64,
        fee_debt: user_position.fee_debt,
        total_claimed: user_position.claimed_total,
        last_accrual_ts: now_ts,
        timestamp: now_ts,
    });


    Ok(())
}

#[event]
pub struct ClaimPresaleFeesRewardsEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub claimed_amount: u64,
    pub fee_debt: u128,
    pub total_claimed: u64,
    pub last_accrual_ts: i64,
    pub timestamp: i64,
}