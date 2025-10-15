use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount, Mint};
use crate::{VaultConfig, TokenConfig, UserYieldPosition, ErrorCode, YieldVault};

#[derive(Accounts)]
pub struct ActivatePresale<'info> {
    #[account(mut)]
    pub bot: Signer<'info>,

    /// CHECK: This is the user's wallet that owns the token.
    /// We don't deserialize it because we need to transfer tokens over.
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    pub token_config: Box<Account<'info, TokenConfig>>,

    #[account(mut)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(mut)]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    #[account(mut)]
    pub user_yield_position: Box<Account<'info, UserYieldPosition>>,

}

pub fn activate_presale(ctx: Context<ActivatePresale>) -> Result<()> {
    
    let vault_config = &mut ctx.accounts.vault_config;
    let token_config = &mut ctx.accounts.token_config;
    let user_yield_position = &mut ctx.accounts.user_yield_position;
    let yield_vault = &mut ctx.accounts.yield_vault;

    let presale_tokens = token_config.pre_sale_token_allocation;
    
    yield_vault.total_staked = yield_vault.total_staked
            .checked_add(presale_tokens)
            .ok_or(ErrorCode::Overflow)?; 
    
    user_yield_position.initial_deposit = user_yield_position.initial_deposit
            .checked_add(presale_tokens)
            .ok_or(ErrorCode::Overflow)?; 
    
    user_yield_position.deposited = user_yield_position.deposited
            .checked_add(presale_tokens)
            .ok_or(ErrorCode::Overflow)?; 
    
    emit!(ActivatePresaleEvent {
        mint: ctx.accounts.mint.key(),
        owner: ctx.accounts.owner.key(),
        total_staked: yield_vault.total_staked,
        initial_deposit: user_yield_position.initial_deposit,
        deposited:user_yield_position.deposited,
        accumulated_c: vault_config.accumulated_c,
        token_reserve: vault_config.token_reserve,
        sol_reserve: vault_config.sol_reserve,
        virtual_sol: vault_config.virtual_sol,
        virtual_tokens: vault_config.virtual_tokens,
    });

    Ok(())
}

#[event]
pub struct ActivatePresaleEvent {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub total_staked: u64,
    pub initial_deposit: u64,
    pub deposited: u64,
    pub accumulated_c: i64,
    pub token_reserve: u64,
    pub sol_reserve: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64, 
}
