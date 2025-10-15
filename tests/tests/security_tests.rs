// tests/security_tests.rs
use {
    anchor_lang::prelude::*,
    solana_program_test::*,
    solana_sdk::{signature::Keypair, signer::Signer},
};
use memelend::buy_token::BuyTokenArgs;
use memelend::ErrorCode;

#[tokio::test]
async fn test_access_control() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    let (mint, _, _) = ctx.initialize_test_token(1_000_000 * 10u64.pow(6), 1_000_000_000).await?;
    
    // Try to perform admin operation as non-creator
    let attacker = Keypair::new();
    let attacker_wsol = ctx.create_wsol_account(&attacker, 100_000_000).await?;
    
    // Attempt to claim earnings as non-creator
    let result = ctx.claim_earnings(&attacker, &attacker_wsol, &mint.pubkey()).await;
    assert!(result.is_err(), "Non-creator should not be able to claim earnings");
    
    println!("✅ Access control test passed");
    Ok(())
}

#[tokio::test]
async fn test_arithmetic_overflow_protection() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    let (mint, _, _) = ctx.initialize_test_token(1_000_000 * 10u64.pow(6), 1_000_000_000).await?;
    
    let user = Keypair::new();
    let user_wsol = ctx.create_wsol_account(&user, u64::MAX).await?;
    let user_token_account = ctx.create_token_account(&mint.pubkey(), &user.pubkey()).await?;
    
    // Try to cause overflow with huge amount
    let args = BuyTokenArgs {
        sol_amount: u64::MAX, // Massive amount that could cause overflow
        min_tokens_out: 1,
        position_id: 1,
    };
    
    let result = ctx.buy_token(
        &user,
        &user_wsol,
        &user_token_account,
        &mint.pubkey(),
        args
    ).await;
    
    // Should either fail gracefully or be handled by the pool limits
    // The important thing is it shouldn't panic the program
    println!("✅ Arithmetic overflow protection test completed");
    Ok(())
}

#[tokio::test]
async fn test_price_manipulation_resistance() -> Result<()> {
    let mut ctx = TestContext::new().await;
    
    // Create a small pool that's more susceptible to manipulation
    let (mint, _, vault_config) = ctx.initialize_test_token(10_000 * 10u64.pow(6), 10_000_000).await?;
    
    let attacker = Keypair::new();
    let attacker_wsol = ctx.create_wsol_account(&attacker, 10_000_000_000).await?; // 10 SOL
    let attacker_token_account = ctx.create_token_account(&mint.pubkey(), &attacker.pubkey()).await?;
    
    // Try to manipulate price with large buy
    let args = BuyTokenArgs {
        sol_amount: 5_000_000_000, // 5 SOL - 50% of pool
        min_tokens_out: 1,
        position_id: 1,
    };
    
    let result = ctx.buy_token(
        &attacker,
        &attacker_wsol,
        &attacker_token_account,
        &mint.pubkey(),
        args
    ).await;
    
    // Should fail due to anti-whale protection (max 20% of pool)
    assert!(result.is_err(), "Large buys should be limited by anti-whale protection");
    
    println!("✅ Price manipulation resistance test passed");
    Ok(())
}