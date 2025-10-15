use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke,
};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::sync_native;
use anchor_spl::token::CloseAccount;
use std::str::FromStr;
use crate::{VaultConfig, ErrorCode};



#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Validated in handler
    #[account(mut)]
    pub creator_wsol_account: AccountInfo<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = creator,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = wsol_vault_authority,
    )]
    pub wsol_liquidity_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA only
    #[account(
        seeds = [b"vault_wsol_authority", mint.key().as_ref()],
        bump,
    )]
    pub wsol_vault_authority: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
    let creator = &ctx.accounts.creator;
    let creator_wsol_account = &ctx.accounts.creator_wsol_account;
    let token_program = &ctx.accounts.token_program;
    let associated_token_program = &ctx.accounts.associated_token_program;
    let system_program = &ctx.accounts.system_program;

    let _mint_key = ctx.accounts.mint.key();
    let wsol_mint = Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap();

    // Validate WSOL account address
    let expected_ata = anchor_spl::associated_token::get_associated_token_address(
        &creator.key(),
        &wsol_mint
    );
    require!(
        creator_wsol_account.key() == expected_ata,
        ErrorCode::InvalidWSOLAddress
    );

    // Create WSOL ATA if missing
    if creator_wsol_account.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new(
            associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: creator.to_account_info(),
                associated_token: creator_wsol_account.to_account_info(),
                authority: creator.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: system_program.to_account_info(),
                token_program: token_program.to_account_info(),
            }
        ))?;
    }

    // Sync WSOL balance
    invoke(
        &sync_native(
            &anchor_spl::token::ID,
            &creator_wsol_account.key(),
        )?,
        &[
            creator_wsol_account.to_account_info(),
            token_program.to_account_info(),
        ],
    )?;

    // Transfer WSOL to vault
    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: creator_wsol_account.to_account_info(),
                to: ctx.accounts.wsol_liquidity_vault.to_account_info(),
                authority: creator.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update vault config reserves - SINGLE BLOCK
    let vault_config = &mut ctx.accounts.vault_config;

    msg!("before_liq_sol_reserve: {}", vault_config.sol_reserve);

    // Update SOL reserve (only once!)
    vault_config.sol_reserve = vault_config.sol_reserve
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;

    msg!("sol_reserve: {}", vault_config.sol_reserve);
    msg!("liq_added: {}", amount);

    // Validate reserves
    require!(
        vault_config.sol_reserve > 0 && vault_config.token_reserve > 0,
        ErrorCode::InvalidVaultAmounts
    );

    // Close WSOL ATA to refund rent back to the creator
    token::close_account(
        CpiContext::new(
            token_program.to_account_info(),
            CloseAccount {
                account: creator_wsol_account.to_account_info(),
                destination: creator.to_account_info(),
                authority: creator.to_account_info(),
            },
        ),
    )?;

   
    emit!(LiquidityAdded {
        creator: creator.key(),
        mint: ctx.accounts.mint.key(),
        liq_added:amount,
        sol_reserve: vault_config.sol_reserve,
        token_reserve: vault_config.token_reserve,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
        accumulated_c: vault_config.accumulated_c,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct LiquidityAdded {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub liq_added: u64,
    pub sol_reserve: u64,
    pub token_reserve: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
    pub accumulated_c: i64,
    pub timestamp: i64,
}