use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount, Mint};
use crate::{ ErrorCode, ReferralVault };


#[derive(Accounts)]
pub struct ClaimReferralRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(mut)]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    #[account(address = user.key())]
    pub temp_wsol_authority: Signer<'info>,
    
    /// CHECK: PDA authority for referral
    #[account(
        seeds = [b"vault_referral_authority", referrer.key().as_ref()],
        bump
    )]
    pub referral_vault_authority: AccountInfo<'info>,

    #[account(mut)]
    pub referral_tracking: Account<'info, ReferralVault>,

    #[account(mut)]
    pub referral_token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Only used for seeds/validation
    pub referrer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_referral_rewards(ctx: Context<ClaimReferralRewards>) -> Result<()> {
    let referral_tracking = &mut ctx.accounts.referral_tracking;
    
    //  Calculate user pending rewards
    let pending = referral_tracking.pending_rewards;

    // Check to see if pending is greater than zero else no rewards available to withdraw
    require!(pending > 0, ErrorCode::NoRewardsAvailable);

    // Transfer pending rewards from Referrer Vault -> User
    let cpi_accounts = Transfer {
        from: ctx.accounts.referral_token_vault.to_account_info(),
        to: ctx.accounts.temp_wsol_account.to_account_info(),
        authority: ctx.accounts.referral_vault_authority.to_account_info(), // PDA authority
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();

    let referrer = ctx.accounts.referrer.key();
        let signer_seeds = &[
            b"vault_referral_authority",
            referrer.as_ref(),
            &[ctx.bumps.referral_vault_authority],
        ];

    token::transfer(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, &[signer_seeds]),
        pending,
    )?;


    // Update user pending rewards
    referral_tracking.pending_rewards = 0;

    emit!(ClaimReferralRewardEvent {
        owner: ctx.accounts.user.key(),
        pending_rewards: referral_tracking.pending_rewards,
    });


    Ok(())
}

#[event]
pub struct ClaimReferralRewardEvent {
    pub owner: Pubkey,
    pub pending_rewards: u64,
}