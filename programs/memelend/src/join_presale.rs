use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
use anchor_spl::token::spl_token::native_mint::ID as NATIVE_MINT_ID;
use crate::{VaultConfig, TokenConfig, ErrorCode, UserPreSalePosition};
use crate::get_price_from_vault;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PresaleArgs {
    pub sol_amount: u64,
    pub min_tokens: u64,
    pub position_id: u64,
}

#[derive(Accounts)]
#[instruction(args: PresaleArgs)]
pub struct JoinPresale<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub wsol_mint: Account<'info, Mint>,

    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub temp_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: signer PDA
    pub temp_wsol_authority: AccountInfo<'info>,

    #[account(mut)]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(mut)]
    pub token_config: Box<Account<'info, TokenConfig>>,

    /// CHECK: PDA authority for vaults
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"vault_wsol", mint.key().as_ref()],
        bump,
        token::mint = wsol_mint,
    )]
    pub liquidity_sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = lending_vault.mint == token_config.mint,
    )]
    pub lending_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA authority for lending vault
    #[account(
        seeds = [b"vault_lending_authority", mint.key().as_ref()],
        bump,
    )]
    pub lending_vault_authority: AccountInfo<'info>,

    #[account(
        init,
        payer = user,
        seeds = [b"user_presale_position", user.key().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + UserPreSalePosition::LEN
    )]
    pub user_presale_position: Box<Account<'info, UserPreSalePosition>>,

    #[account(mut)]
    pub bot_wsol_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn join_presale(ctx: Context<JoinPresale>, args: PresaleArgs) -> Result<()> {

    let sol_amount = args.sol_amount;
    let min_tokens = args.min_tokens;
    let position_id = args.position_id;
    msg!("sol_amount: {}", sol_amount);
    msg!("min_tokens: {}", min_tokens);
    msg!("position_id: {}", position_id);

    require!(ctx.accounts.token_config.pre_sale_token_allocation > 0, ErrorCode::PresaleSoldOut);
    require!(sol_amount > 0, ErrorCode::InvalidInput);
    require!(min_tokens > 0, ErrorCode::InvalidInput);
    

    //Check to see if user buying the presale tokens is the creator
    // require!(
    //     ctx.accounts.user.key() != ctx.accounts.token_config.creator,
    //     ErrorCode::CreatorCannotBuyPresale
    // );

    // === Calculate Liquidator Reward (Hybrid Model) ===
    let automation_fee_bps: u64 = 100; // 1%

    let percent_fee = sol_amount
        .checked_mul(automation_fee_bps)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10_000) // BPS divisor
        .ok_or(ErrorCode::Overflow)?;
 

    let net_sol_to_liquidity  = sol_amount
        .checked_sub(percent_fee)
        .ok_or(ErrorCode::Underflow)?;
    msg!("net_sol_to_liquidity: {}", net_sol_to_liquidity);
    
    let accumulated_c = ctx.accounts.vault_config.accumulated_c as i128;
    msg!("accumulated_c: {}", accumulated_c);

    let denominator = (ctx.accounts.vault_config.sol_reserve as i128)
        .checked_add(ctx.accounts.vault_config.virtual_sol as i128)
        .and_then(|sum| sum.checked_add(accumulated_c))
        .and_then(|sum| sum.checked_add(net_sol_to_liquidity as i128))
        .and_then(|sum| u64::try_from(sum).ok())
        .ok_or(ErrorCode::Overflow)?;
    msg!("denominator: {}", denominator);

    let effective_token_reserve = ctx.accounts.vault_config.virtual_tokens as u128
    + ctx.accounts.vault_config.token_reserve as u128;
    msg!("effective_token_reserve: {}", effective_token_reserve);

    let numerator = (net_sol_to_liquidity as u128)
        .checked_mul(effective_token_reserve)
        .ok_or(ErrorCode::Overflow)?;
    msg!("numerator: {}", numerator);

    let token_out = numerator
        .checked_div(denominator as u128)
        .ok_or(ErrorCode::Overflow)? as u64;
    msg!("token_out: {}", token_out);

    // Slippage check
    require!(
        token_out >= min_tokens,
        ErrorCode::SlippageExceeded
    );

    require!(
    ctx.accounts.token_config.pre_sale_tokens_sold + token_out <= ctx.accounts.token_config.pre_sale_token_allocation,
        ErrorCode::PresaleSoldOut
    );

    msg!("pre_sale_token_allocation: {}", ctx.accounts.token_config.pre_sale_token_allocation);

    // Transfer WSOL collateral from user to WSOL liquidity vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_wsol_account.to_account_info(),
                to: ctx.accounts.liquidity_sol_vault.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        ),
        net_sol_to_liquidity,
    )?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_wsol_account.to_account_info(),
                to: ctx.accounts.bot_wsol_account.to_account_info(), // Bot's WSOL account
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        ),
        percent_fee,
    )?;

    // Transfer borrowed tokens from lending vault to token liquidity vault
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"vault_lending_authority",
        mint_key.as_ref(),
        &[ctx.bumps.lending_vault_authority],
    ];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lending_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.lending_vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        token_out,
    )?;

    ctx.accounts.token_config.pre_sale_tokens_sold =
        ctx.accounts.token_config.pre_sale_tokens_sold.checked_add(token_out).ok_or(ErrorCode::Overflow)?;
    
    ctx.accounts.vault_config.sol_reserve = ctx.accounts.vault_config.sol_reserve
        .checked_add(net_sol_to_liquidity)
        .ok_or(ErrorCode::Overflow)?;

    ctx.accounts.token_config.pre_sale_token_allocation =
        ctx.accounts.token_config.pre_sale_token_allocation.checked_sub(token_out).ok_or(ErrorCode::Underflow)?;

    ctx.accounts.token_config.pre_sale_participants = ctx.accounts.token_config.pre_sale_participants
        .checked_add(1)
        .ok_or(ErrorCode::Overflow)?;


    // --- Calculate the entry price after everything has gone through ---
    let entry_price = get_price_from_vault(
        ctx.accounts.vault_config.sol_reserve,
        ctx.accounts.vault_config.accumulated_c,
        ctx.accounts.vault_config.token_reserve,
        ctx.accounts.vault_config.virtual_sol,
        ctx.accounts.vault_config.virtual_tokens,
        ctx.accounts.mint.decimals,
    );

    msg!("entry_price: {}", entry_price);
    msg!("tokens_sold: {}", ctx.accounts.token_config.pre_sale_tokens_sold);
    

    // Store presale position
    let position = &mut ctx.accounts.user_presale_position;
    position.user = ctx.accounts.user.key();
    position.mint = ctx.accounts.mint.key();
    position.entry_price = entry_price;
    position.position_id = position_id;
    position.initial_bought = token_out;
    position.sol_amount = net_sol_to_liquidity;
    position.open = true;
    position.last_action_ts = Clock::get()?.unix_timestamp;

    //--- Close accounts ---
    token::close_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.temp_wsol_account.to_account_info(),
                destination: ctx.accounts.user.to_account_info(),
                authority: ctx.accounts.temp_wsol_authority.to_account_info(),
            },
        )
    )?;

    emit!(PresaleEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        amount: net_sol_to_liquidity,
        sol_reserve: ctx.accounts.vault_config.sol_reserve,
        token_out,
        pre_sale_token_allocation: ctx.accounts.token_config.pre_sale_token_allocation,
        position_id: args.position_id,
        entry_price: entry_price,
        timestamp: Clock::get()?.unix_timestamp,
    });


    Ok(())
}

#[event]
pub struct PresaleEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub token_out: u64,
    pub pre_sale_token_allocation: u64, 
    pub position_id: u64,
    pub entry_price: u64,
    pub sol_reserve: u64, 
    pub timestamp: i64,
}