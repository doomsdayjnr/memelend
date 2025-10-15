use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo, Transfer, TokenAccount, Mint, Token};
use anchor_spl::associated_token::AssociatedToken;

pub mod add_liquidity;
pub mod join_presale;
pub mod activate_presale;
pub mod claim_presale_earnings;
pub mod buy_token;
pub mod sell_token;
pub mod go_short;
pub mod close_position;
pub mod liquidate_position;
pub mod deposit_yield;
pub mod claim_yield_token;
pub mod claim_yield_rewards;
pub mod creator_yield_withdrawal;
pub mod claim_earnings;
pub mod claim_referral_rewards;


use add_liquidity::*;
use join_presale::*;
use activate_presale::*;
use claim_presale_earnings::*;
use buy_token::*;
use sell_token::*;
use go_short::*;
use close_position::*;
use liquidate_position::*;
use deposit_yield::*;
use claim_yield_token::*;
use claim_yield_rewards::*;
use creator_yield_withdrawal::*;
use claim_earnings::*;
use claim_referral_rewards::*;


use crate::buy_token::{BuyTokenArgs, BuyToken};
use crate::sell_token::{SellTokenArgs, SellToken};
use crate::go_short::{GoShortArgs, GoShort};



declare_id!("DRd15yZQhiAzzSZZtHSVWZFoqQ51sPRsF3B1yNTrxrG");

pub const PLATFORM_FEE_BPS: u64 = 100; // 1%

// Helper function to get current price
pub fn get_price_from_vault(sol_reserve: u64, accumulated_c: i64, token_reserve: u64, virtual_sol: u64, virtual_tokens: u64, decimals: u8) -> u64 {
    let effective_reserve = (sol_reserve as i128) // cast to signed
        .checked_add(virtual_sol as i128)
        .and_then(|sum| sum.checked_add(accumulated_c as i128))
        .unwrap_or(0); // fallback if overflow (safe default)

    let effective_reserve_u128 = if effective_reserve < 0 { 0 } else { effective_reserve as u128 };

    let effective_token_reserve = (token_reserve as u128) // cast to signed
        .checked_add(virtual_tokens as u128)
        .unwrap_or(1);

    effective_reserve_u128
        .checked_mul(10u128.pow(decimals as u32 + 6))
        .unwrap_or(0)
        .checked_div(effective_token_reserve as u128)
        .unwrap_or(0) as u64
}



#[program]
pub mod memelend {
    use super::*;

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        add_liquidity::handler(ctx, amount)
    }

    pub fn join_presale(ctx: Context<JoinPresale>, args: PresaleArgs) -> Result<()> {
        join_presale::join_presale(ctx, args)
    }

    pub fn activate_presale(ctx: Context<ActivatePresale>) -> Result<()> {
        activate_presale::activate_presale(ctx)
    }

    pub fn claim_presale_rewards(ctx: Context<ClaimPresaleRewards>) -> Result<()> {
        claim_presale_earnings::claim_presale_rewards(ctx)
    }

    pub fn yield_deposit(ctx: Context<DepositYield>, amount: u64, position_id: u64) -> Result<()> {
        deposit_yield::yield_deposit(ctx, amount, position_id)
    }

    pub fn withdraw_yield(ctx: Context<WithdrawYield>, amount: u64, position_id: u64) -> Result<()> {
        claim_yield_token::withdraw_yield(ctx, amount, position_id)
    }

    pub fn creator_yield_withdrawal(ctx: Context<CreatorWithdrawYield>, amount: u64, position_id: u64) -> Result<()> {
        creator_yield_withdrawal::creator_yield_withdrawal(ctx, amount, position_id)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        claim_yield_rewards::claim_rewards(ctx)
    }

    pub fn claim_referral_rewards(ctx: Context<ClaimReferralRewards>) -> Result<()> {
        claim_referral_rewards::claim_referral_rewards(ctx)
    }

    pub fn buy_token(ctx: Context<BuyToken>, args: BuyTokenArgs) -> Result<()> {
        buy_token::buy_token(ctx, args)
    }

    pub fn sell_token(ctx: Context<SellToken>, args: SellTokenArgs) -> Result<()> {
        sell_token::sell_token(ctx, args)
    }

    pub fn go_short(ctx: Context<GoShort>, args: GoShortArgs) -> Result<()> {
        go_short::go_short(ctx, args)
    }

    pub fn close_position(ctx: Context<ClosePosition>, args: ClosePositionArgs) -> Result<()> {
        close_position::close_position(ctx, args)
    }

    pub fn liquidate_position(ctx: Context<LiquidatePosition>, args: LiquidatePositionArgs) -> Result<()> {
        liquidate_position::liquidate_position(ctx, args)
    }

    pub fn claim_earnings(ctx: Context<ClaimEarnings>) -> Result<()> {
        claim_earnings::claim_earnings(ctx)
    }

    pub fn initialize_token_and_split_supply(
        ctx: Context<InitTokenAndSplitSupply>, 
        token_id: String, 
        _symbol: String,
        _total_supply: u64,
        lend_percent: u8,
        position_id: u64,
        presale_percent: u8,
    )-> Result<()>{
       

        let total_supply: u64 = 1_000_000_000 * 10u64.pow(6); // 1B tokens, 6 decimals
        let token_id_bytes = token_id.as_bytes();
        let creator_key = ctx.accounts.creator.key();
        let mint_seeds = &[b"mint_authority", creator_key.as_ref(), token_id_bytes, &[ctx.bumps.mint_authority]];
        let mint_signer = &[&mint_seeds[..]];

        msg!("lend_percent: {}", lend_percent);
        msg!("presale_percent: {}", presale_percent);

        // Mint total supply to the token vault
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                mint_signer,
            ),
            total_supply,
        )?;

        // Calculate allocations
        let lend_amount = total_supply
            .checked_mul(lend_percent as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(100)
            .ok_or(ErrorCode::DivisionByZero)?;

        let liquidity_amount = total_supply
            .checked_sub(lend_amount)
            .ok_or(ErrorCode::Underflow)?;

        let mut creator_stake_amount = lend_amount;

        if presale_percent > 0 {
            let presale_amount = lend_amount
                .checked_mul(presale_percent as u64)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(100)
                .ok_or(ErrorCode::DivisionByZero)?;

            let config = &mut ctx.accounts.token_config;
            config.pre_sale_token_allocation = presale_amount;
            config.pre_sale_fee_bps = presale_percent;

            msg!("presale_amount: {}", presale_amount);
            // Reduce the creator’s effective stake
            creator_stake_amount = creator_stake_amount
                .checked_sub(presale_amount)
                .ok_or(ErrorCode::Underflow)?;
        }

        msg!("creator_stake_amount: {}", creator_stake_amount);
        

        let mint_key = ctx.accounts.mint.key();

        let token_vault_signer_seeds = &[
            b"vault_token_authority",
            mint_key.as_ref(),
            &[ctx.bumps.token_vault_authority],
        ];

        // Transfer staked amount of tokens to the lending vault
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.lending_vault.to_account_info(),
                    authority: ctx.accounts.token_vault_authority.to_account_info(),
                },
                &[token_vault_signer_seeds],
            ),
            lend_amount,
        )?;

        // Transfer the rest of the token to the liquidity vault as Token reserve
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.liquidity_vault.to_account_info(),
                    authority: ctx.accounts.token_vault_authority.to_account_info(),
                },
                &[token_vault_signer_seeds],
            ),
            liquidity_amount,
        )?;

        // Save token configuration
        let config = &mut ctx.accounts.token_config;
        let clock = Clock::get()?;

        // Set known fields
        config.creator = ctx.accounts.creator.key();
        config.mint = ctx.accounts.mint.key();
        config.lending_vault = ctx.accounts.lending_vault.key();
        config.liquidity_vault = ctx.accounts.liquidity_vault.key();
        config.launch_timestamp = clock.unix_timestamp;
        config.creator_total_tokens = total_supply;
        

        // Set default placeholders for others
        config.project_vault = Pubkey::default();
        config.platform_vault = Pubkey::default();
        config.wsol_liquidity_vault = Pubkey::default();

        // Initialize YieldVault
        let now_ts = Clock::get()?.unix_timestamp;
        ctx.accounts.yield_vault.mint = ctx.accounts.mint.key();
        ctx.accounts.yield_vault.apr_bps = 1000; // example 10% APR
        ctx.accounts.yield_vault.total_staked = creator_stake_amount; 
        ctx.accounts.yield_vault.creator = ctx.accounts.creator.key();
        ctx.accounts.yield_vault.launch_ts = now_ts;
        ctx.accounts.yield_vault.max_withdraw_bps = 10_000;
        ctx.accounts.yield_vault.last_accrual_ts = now_ts;
        ctx.accounts.yield_vault.bump = ctx.bumps.yield_vault;


        // Initialize creator's UserYieldPosition
        ctx.accounts.user_yield_position.owner = ctx.accounts.creator.key();
        ctx.accounts.user_yield_position.mint = ctx.accounts.mint.key();
        ctx.accounts.user_yield_position.position_id = position_id;
        ctx.accounts.user_yield_position.is_creator = true;
        ctx.accounts.user_yield_position.initial_deposit = creator_stake_amount;
        ctx.accounts.user_yield_position.deposited = creator_stake_amount; // initial deposit can be added immediately
        ctx.accounts.user_yield_position.deposited_at = now_ts;
        ctx.accounts.user_yield_position.last_action_ts = now_ts;
        ctx.accounts.user_yield_position.bump = ctx.bumps.user_yield_position;


        emit!(TokenLaunchEvent {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            apr_bps: ctx.accounts.yield_vault.apr_bps as u64,
            acc_reward_per_share: 0,
            max_withdraw_bps: ctx.accounts.yield_vault.max_withdraw_bps as u64,
            position_id: position_id,
            is_creator: true,
            claimed_principal: 0,
            deposited: creator_stake_amount,
            reward_debt: 0,
            claimed_total: 0,
            timestamp: clock.unix_timestamp,
        });

        Ok(())

    }

    pub fn initialize_fee_vaults(ctx: Context<InitFeeVault>, creator_fee_bps: u16)-> Result<()>{
      
        let config = &mut ctx.accounts.token_config;

        config.project_vault = ctx.accounts.project_vault.key();
        config.platform_vault = ctx.accounts.platform_vault.key();
        config.wsol_liquidity_vault = ctx.accounts.wsol_liquidity_vault.key();
        config.creator_fee_bps = creator_fee_bps;
        config.platform_fee_bps = PLATFORM_FEE_BPS as u16;
        

        // Initialize VaultConfig
        let vault_config = &mut ctx.accounts.vault_config;
        vault_config.mint = ctx.accounts.mint.key();
        vault_config.token_reserve = ctx.accounts.liquidity_vault.amount; // Update token reserve
        //These two values will be to stabilize price, not actual vault amounts
        vault_config.virtual_sol = 300_000_000_000; // = 300 SOL in lamports
        vault_config.virtual_tokens = 73_000_000 * 10u64.pow(6); // 73 million tokens (6 decimals)

        emit!(TokenConfirmedLaunchEvent {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            token_reserve: vault_config.token_reserve,
            virtual_sol: vault_config.virtual_sol,
            virtual_tokens: vault_config.virtual_tokens,
            is_live: true,
        });

        Ok(())

    }
     
}

#[derive(Accounts)]
#[instruction(token_id: String)]
pub struct InitTokenAndSplitSupply<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"mint", creator.key().as_ref(), token_id.as_bytes()],
        bump,
        mint::decimals = 6,
        mint::authority = mint_authority
    )]
    pub mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA (no signing required)
    #[account(
        seeds = [b"mint_authority", creator.key().as_ref(), token_id.as_bytes()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_token", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = token_vault_authority,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_token_authority", mint.key().as_ref()],
        bump,
    )]
    pub token_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_lending", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = lending_vault_authority,
    )]
    pub lending_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_lending_authority", mint.key().as_ref()],
        bump,
    )]
    pub lending_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_liquidity", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = liquidity_vault_authority,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_liquidity_authority", mint.key().as_ref()],
        bump,
    )]
    pub liquidity_vault_authority: UncheckedAccount<'info>,


    /// CHECK: PDA that owns all vaults (no signing required)
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"yield_vault", mint.key().as_ref()],
        bump,
        space = 8 + YieldVault::LEN
    )]
    pub yield_vault: Box<Account<'info, YieldVault>>,

    #[account(
        init,
        payer = creator,
        seeds = [b"user_yield", mint.key().as_ref(), creator.key().as_ref()],
        bump,
        space = 8 + UserYieldPosition::LEN
    )]
    pub user_yield_position: Box<Account<'info, UserYieldPosition>>,

    /// CHECK: PDA (no signing required)
    #[account(
        init,
        payer = creator,
        space = 8 + TokenConfig::INIT_SPACE, // Anchor discriminator + content
        seeds = [b"config", mint.key().as_ref()],
        bump,
    )]
    pub token_config: Box<Account<'info, TokenConfig>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction()]
pub struct InitFeeVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, has_one = mint)]
    pub token_config: Account<'info, TokenConfig>,

    pub mint: Account<'info, Mint>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault_liquidity", mint.key().as_ref()],
        bump,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = wsol_vault_authority,
    )]
    pub wsol_liquidity_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_project", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = vault_authority,
    )]
    pub project_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_platform", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
        token::authority = vault_authority,
    )]
    pub platform_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault_wsol_authority", mint.key().as_ref()],
        bump,
    )]
    pub wsol_vault_authority: UncheckedAccount<'info>,

    /// CHECK: PDA
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump,
        space = 8 + VaultConfig::LEN,
    )]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

//Make sure byte space are allocated correctly!
#[account]
pub struct TokenConfig {
    pub creator: Pubkey,              
    pub creator_fee_bps: u16,        
    pub platform_fee_bps: u16, 
    pub pre_sale_fee_bps: u8,         
    pub mint: Pubkey,                 
    pub lending_vault: Pubkey,        
    pub liquidity_vault: Pubkey,      
    pub project_vault: Pubkey,        
    pub platform_vault: Pubkey,       
    pub wsol_liquidity_vault: Pubkey, 
    pub launch_timestamp: i64,         
    pub creator_total_tokens: u64,     
    pub pre_sale_token_allocation: u64,
    pub pre_sale_tokens_sold: u64,
    pub pre_sale_acc_fee_per_share: u128,
    pub last_accrual_ts: i64,
    pub pre_sale_participants: u32,
}

impl TokenConfig {
    pub const INIT_SPACE: usize =
        8   // discriminator
        + (32 * 10)  // 10 Pubkeys
        + (2 * 2)    // 2 u16s
        + 1          // 1 u8
        + (8 * 5)    // 6 u64/i64
        + 16
        + 4;         // 1 u32
}


#[account]
pub struct Position {
    pub owner: Pubkey,
    pub entry_price: u64,
    pub amount: u64,         
    pub mint: Pubkey,        
    pub open: bool,
    pub collateral: u64,
    pub liquidate: u64,  
    pub position_id: u64,
    pub created_at: i64, 
}

impl Position {
    pub const LEN: usize = 32 + 8 + 8 + 32 + 1 + 8 + 8 + 8 + 8;
}

#[account]
pub struct VaultConfig {
    pub mint: Pubkey,
    pub token_reserve: u64,     // x - Token amount in vault
    pub sol_reserve: u64,       // y - SOL (or wSOL) in vault
    pub accumulated_c: i64,     // c - accumulated WSOL from failed shorts
    pub virtual_sol: u64,       // y - Virtual SOL (or wSOL) to stablize price (Not in vault, for math only)
    pub virtual_tokens: u64,    // x - Virtual Token amount to stablize price (Not in vault, for math only)
    pub creator_vault: u64, 
    pub platform_vault: u64,  
    pub yield_vault: u64,
    pub pre_sale_vault: u64,
    pub bump: u8,
    pub last_trade_timestamp: i64,
}

impl VaultConfig {
    pub const LEN: usize = 8   // discriminator
        + 32  // mint
        + 8   // token_reserve
        + 8   // sol_reserve
        + 8   // accumulated_c
        + 8   // virtual_sol
        + 8   // virtual_tokens
        + 8   // creator_vault
        + 8   // platform_vault
        + 8   // yield_vault
        + 8   // pre_sale_vault
        + 1   // bump
        + 8;  // last_trade_timestamp
}

//for future use
// #[account]
// pub struct UserProfile {
//     pub owner: Pubkey,
//     pub is_creator: bool,
//     pub is_trader: bool,
//     pub tokens_launched: u32,
//     pub total_volume: u64,
//     pub tokens_held_long: u8,
//     pub referrals: u16,
//     pub creator_rank: u8,
//     pub trader_rank: u8,  
//     pub last_updated: i64,
// }

#[account]
pub struct ReferralVault {
    pub referrer: Pubkey,
    pub pending_rewards: u64, 
    pub total_earned: u64,
}

#[account]
pub struct YieldVault {
    pub mint: Pubkey,             // Token mint
    pub apr_bps: u16,             // e.g. 1000 = 10% APR
    pub total_staked: u64,        // Current deposits
    pub total_earned: u64, 
    pub acc_reward_per_share: u128, // Cumulative index (scaled by 1e12)
    pub creator: Pubkey,          // the project creator
    pub launch_ts: i64,           // when the pool went live
    pub max_withdraw_bps: u16,    // 10000 = 100% (basis points)
    pub last_accrual_ts: i64,     // Last time rewards updated
    pub bump: u8,                 // PDA bump
}

impl YieldVault {
    pub const LEN: usize = 32 + 2 + 8 + 8 + 16 + 32 + 8 + 2 + 8 + 1; 
}

#[account]
pub struct UserYieldPosition {
    pub owner: Pubkey,        // User’s wallet
    pub mint: Pubkey,         // Token mint
    pub position_id: u64,
    pub is_creator: bool,
    pub claimed_principal: u64,   // how much of principal creator already pulled out
    pub initial_deposit: u64,     // snapshot of creator’s total locked deposit
    pub deposited: u64,       // Current staked balance (shares)
    pub reward_debt: u128,    // For reward per share accounting
    pub claimed_total: u64,
    pub deposited_at: i64,    // When user first deposited (epoch seconds)
    pub last_action_ts: i64,  // Last deposit/withdraw/claim
    pub bump: u8,             // PDA bump
}

impl UserYieldPosition {
    pub const LEN: usize = 32 + 32 + 8 + 1 + 8 + 8 + 8 + 16 + 8 + 8 + 8 + 1; 
}

#[account]
pub struct UserPreSalePosition {
    pub user: Pubkey,        // 32 bytes
    pub mint: Pubkey,         // 32 bytes
    pub entry_price: u64,     // 8 bytes
    pub position_id: u64,     // 8 bytes
    pub initial_bought: u64,  // 8 bytes // Current fees balance (shares)
    pub sol_amount: u64,      // 8 bytes
    pub fee_debt: u128,       // 16 bytes
    pub claimed_total: u64,   // 8 bytes
    pub open: bool,           // 1 byte
    pub last_action_ts: i64,  // 8 bytes
    pub bump: u8,             // 1 byte
}

impl UserPreSalePosition {
    pub const LEN: usize = 8   // discriminator
        + 32   // owner
        + 32   // mint
        + 8    // entry_price
        + 8    // position_id
        + 8    // initial_bought
        + 8    // sol_amount
        + 16   // fee_debt
        + 8    // claimed_total
        + 1    // open
        + 8    // last_action_ts
        + 1;   // bump
}


#[event]
pub struct TokenLaunchEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub apr_bps: u64,
    pub acc_reward_per_share: u64,
    pub max_withdraw_bps: u64,
    pub position_id: u64,
    pub is_creator: bool,
    pub claimed_principal: u64,
    pub deposited: u64,
    pub reward_debt: u64,
    pub claimed_total: u64,
    pub timestamp: i64,
}

#[event]
pub struct TokenConfirmedLaunchEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub token_reserve: u64,
    pub virtual_sol: u64,
    pub virtual_tokens: u64,
    pub is_live: bool,
}


#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow occurred during calculation")]
    Overflow,
    #[msg("Token vault has zero supply")]
    ZeroTokenSupply,
    #[msg("Invalid Wsol Mint")]
    InvalidWsolMint,
    #[msg("Division by zero error")]
    DivisionByZero,
    #[msg("Vaults must be non-zero")]
    InvalidVaults,
    #[msg("Token or SOL input must be non-zero")]
    ZeroInput,
    #[msg("Underflow occurred during calculation")]
    Underflow,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Trade cooldown in effect")]
    TradeCooldown,
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,
    #[msg("This Position was already closed.")]
    PositionAlreadyClosed,
    #[msg("Invalid vault mint")]
    InvalidVaultMint,
    #[msg("Invalid WSOL address")]
    InvalidWSOLAddress,
    #[msg("Invalid Vault Amounts")] 
    InvalidVaultAmounts,
    #[msg("Invalid mint account")]
    InvalidMint,
    #[msg("Unauthorized operation")]
    Unauthorized,
    #[msg("Invalid token account")]
    InvalidToken,
    #[msg("Invalid Vault")]
    InvalidVault,
    #[msg("Insufficient Funds")]
    InsufficientFunds,
    #[msg("Price would become too low")]
    InvalidPrice,
    #[msg("Cannot buy more than 50% of pool")]
    AmountTooLarge,
    #[msg("Invalid Position ID")]
    InvalidPositionId,
    #[msg("Reserve Too Low")]
    ReserveTooLow,
    #[msg("Insufficient deposited balance")]
    InsufficientBalance,
    #[msg("No rewards available to claim")]
    NoRewardsAvailable,
    #[msg("Invalid Mint For User Position")]
    InvalidMintForUserPosition,
    #[msg("Creator Cannot Withdraw Here.")]
    CreatorCannotWithdrawHere,
    #[msg("Creator Over Withdrawal")]
    CreatorOverWithdrawal,
    #[msg("Presale is sold out")]
    PresaleSoldOut,
    #[msg("Invalid Input")]
    InvalidInput,
    #[msg("Creator cannot buy presale tokens")]
    CreatorCannotBuyPresale,
}

