use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, Mint, TokenAccount, CloseAccount};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;
use crate::{ YieldVault, ErrorCode, UserYieldPosition, TokenConfig};


pub const PRECISION: u128 = 1_000_000_000_000; // 1e12 for reward per share math
pub const SECONDS_IN_YEAR: u64 = 31_536_000; // 365 days

#[derive(Accounts)]
pub struct DepositYield<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        address = token_config.mint,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = temp_wsol_account.mint == NATIVE_MINT_ID @ ErrorCode::InvalidWsolMint,
    )]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    #[account(address = owner.key())]
    pub temp_wsol_authority: Signer<'info>,

    #[account(mut)]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [b"user_yield", mint.key().as_ref(), owner.key().as_ref()],
        bump,
        space = 8 + UserYieldPosition::LEN
    )]
    pub user_yield_position: Account<'info, UserYieldPosition>,

    #[account(mut)]
    pub lending_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub token_config: Box<Account<'info, TokenConfig>>,

    #[account(mut)]
    pub project_vault: Account<'info, TokenAccount>, 
    
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = user_token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

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

pub fn yield_deposit(ctx: Context<DepositYield>, amount: u64, position_id: u64) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let user_position = &mut ctx.accounts.user_yield_position;

    let now_ts = Clock::get()?.unix_timestamp;

    // Only set these if it's a brand-new account
    if user_position.owner == Pubkey::default() {
        user_position.owner = ctx.accounts.owner.key();
        user_position.mint = ctx.accounts.mint.key();
        user_position.bump = ctx.bumps.user_yield_position;
        user_position.deposited_at = now_ts;
    }

   
    // Calculate user pending rewards
    let pending = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION
        - user_position.reward_debt;


    if pending > 0 {

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds = &[
            b"vault",
            mint_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.project_vault.to_account_info(),
                    to: ctx.accounts.temp_wsol_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            pending as u64,
        )?;

        // update cumulative tracker
        user_position.claimed_total = user_position.claimed_total
            .checked_add(pending as u64)
            .unwrap();
    }


    // Transfer tokens from user -> Lending Vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.lending_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

 
    //  Update user deposited and vault total_staked
    user_position.deposited = user_position.deposited.checked_add(amount).unwrap();
    vault.total_staked = vault.total_staked.checked_add(amount).unwrap();

  
    // Update reward debt for user
    user_position.reward_debt = (user_position.deposited as u128)
        .checked_mul(vault.acc_reward_per_share)
        .unwrap()
        / PRECISION;
    user_position.last_action_ts = now_ts;

    vault.last_accrual_ts = now_ts;

    let token_config = &mut ctx.accounts.token_config;
    let user_key = ctx.accounts.owner.key();
    user_position.is_creator = user_key == token_config.creator;

    // Close temporary wSOL account
    token::close_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.temp_wsol_account.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        )
    )?;

    emit!(DepositYieldEvent {
        owner: user_position.owner,
        mint: user_position.mint,
        position_id: position_id,
        amount:amount,
        deposited: user_position.deposited,
        total_staked: vault.total_staked,
        claimed_total: user_position.claimed_total,
        reward_debt: user_position.reward_debt,
        deposited_at: user_position.deposited_at,
        last_action_ts: user_position.last_action_ts,
        last_accrual_ts: now_ts,
        is_creator: user_position.is_creator,
    });



    Ok(())
}

#[event]
pub struct DepositYieldEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub position_id: u64,
    pub amount: u64,
    pub deposited: u64,
    pub total_staked: u64,
    pub claimed_total: u64,
    pub reward_debt: u128,
    pub deposited_at: i64,
    pub last_action_ts: i64,
    pub last_accrual_ts: i64,
    pub is_creator: bool,
}