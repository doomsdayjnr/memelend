// tests/integration_tests.rs
use {
    super::test_utils::*,
    anchor_lang::prelude::*,
    memelend::src::{
        buy_token::BuyTokenArgs, sell_token::SellTokenArgs, go_short::GoShortArgs, liquidate_position::LiquidatePositionArgs,
        close_position::ClosePositionArgs, ErrorCode, initialize_token_and_split_supply, initialize_fee_vaults
    },
    solana_program_test::*,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
        pubkey::Pubkey,
    },
};

#[tokio::test]
async fn test_buy_token_basic() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    // Initialize token and setup
    let (mint, token_config, vault_config) = ctx.initialize_test_token(1_000_000 * 10u64.pow(6), 1_000_000_000).await?;
    
    let user = Keypair::new();
    let user_wsol = ctx.create_wsol_account(&user, 500_000_000).await?; // 0.5 SOL
    let user_token_account = ctx.create_token_account(&mint.pubkey(), &user.pubkey()).await?;
    
    // Test buying tokens
    let args = BuyTokenArgs {
        sol_amount: 100_000_000, // 0.1 SOL
        min_tokens_out: 1_000,   // Minimum 1000 tokens expected
        position_id: 1,
    };
    
    let result = ctx.buy_token(
        &user,
        &user_wsol,
        &user_token_account,
        &mint.pubkey(),
        args
    ).await;
    
    assert!(result.is_ok(), "Buy token should succeed");
    
    // Verify user received tokens
    let user_token_balance = ctx.get_token_balance(&user_token_account).await;
    assert!(user_token_balance > 0, "User should have received tokens");
    
    println!("✅ Basic buy_token test passed");
    Ok(())
}

#[tokio::test]
async fn test_buy_token_insufficient_funds() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    let (mint, _, _) = ctx.initialize_test_token(1_000_000 * 10u64.pow(6), 1_000_000_000).await?;
    
    let user = Keypair::new();
    let user_wsol = ctx.create_wsol_account(&user, 10_000).await?; // Only 0.00001 SOL
    let user_token_account = ctx.create_token_account(&mint.pubkey(), &user.pubkey()).await?;
    
    let args = BuyTokenArgs {
        sol_amount: 100_000_000, // Try to buy with 0.1 SOL
        min_tokens_out: 1_000,
        position_id: 1,
    };
    
    let result = ctx.buy_token(
        &user,
        &user_wsol,
        &user_token_account,
        &mint.pubkey(),
        args
    ).await;
    
    assert!(result.is_err(), "Should fail with insufficient funds");
    
    println!("✅ Insufficient funds test passed");
    Ok(())
}

#[tokio::test]
async fn test_slippage_protection() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    let (mint, _, _) = ctx.initialize_test_token(100_000 * 10u64.pow(6), 100_000_000).await?; // Small pool
    
    let user = Keypair::new();
    let user_wsol = ctx.create_wsol_account(&user, 500_000_000).await?;
    let user_token_account = ctx.create_token_account(&mint.pubkey(), &user.pubkey()).await?;
    
    // Try to buy with extremely high min_tokens_out that can't be met
    let args = BuyTokenArgs {
        sol_amount: 50_000_000, // 0.05 SOL - large relative to pool
        min_tokens_out: 1_000_000_000, // Impossible minimum
        position_id: 1,
    };
    
    let result = ctx.buy_token(
        &user,
        &user_wsol,
        &user_token_account,
        &mint.pubkey(),
        args
    ).await;
    
    assert!(result.is_err(), "Should fail with slippage exceeded");
    
    // Verify error is SlippageExceeded
    match result {
        Err(ProgramError::Custom(code)) => {
            assert_eq!(code, ErrorCode::SlippageExceeded as u32);
        }
        _ => panic!("Expected SlippageExceeded error"),
    }
    
    println!("✅ Slippage protection test passed");
    Ok(())
}

#[tokio::test]
async fn test_short_position_creation() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    let (mint, _, vault_config) = ctx.initialize_test_token(1_000_000 * 10u64.pow(6), 10_000_000_000).await?;
    
    let user = Keypair::new();
    let user_wsol = ctx.create_wsol_account(&user, 1_000_000_000).await?; // 1 SOL
    
    let args = GoShortArgs {
        collateral_amount: 100_000_000, // 0.1 SOL
        min_tokens_borrowed: 1000,
        position_id: 1,
        collateral_percentage: 50,
        liquidation_price: 50_000, // $0.05 per token
    };
    
    let result = ctx.go_short(&user, &user_wsol, &mint.pubkey(), args).await;
    assert!(result.is_ok(), "Short position creation should succeed");
    
    println!("✅ Short position creation test passed");
    Ok(())
}

#[tokio::test]
async fn test_token_launch_flow() -> Result<()> {
    let ctx = TestContext::new().await;
    let creator = ctx.payer;
    
    // This would test the complete flow from token initialization to trading
    // Implementation depends on your specific initialization functions
    
    println!("✅ Token launch flow test placeholder");
    Ok(())
}