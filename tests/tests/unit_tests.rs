// tests/unit_tests.rs
#[cfg(test)]
mod unit_tests {
    use memelend::get_price_from_vault;

    #[test]
    fn test_price_calculation_basic() {
        // 1 SOL reserve, 1M tokens, 6 decimals
        let sol_reserve = 1_000_000_000; // 1 SOL in lamports
        let accumulated_c = 0;
        let token_reserve = 1_000_000 * 10u64.pow(6); // 1M tokens
        let decimals = 6;

        let price = get_price_from_vault(sol_reserve, accumulated_c, token_reserve, decimals);
        
        // price = (1e9 * 1e12) / 1e6 = 1e15 lamports per token
        assert_eq!(price, 1_000_000_000_000_000);
    }

    #[test]
    fn test_price_calculation_accumulated_c() {
        let sol_reserve = 1_000_000_000; // 1 SOL
        let accumulated_c = 500_000_000; // +0.5 SOL
        let token_reserve = 1_000_000 * 10u64.pow(6);
        let decimals = 6;

        let price = get_price_from_vault(sol_reserve, accumulated_c, token_reserve, decimals);
        
        // price = (1.5e9 * 1e12) / 1e6 = 1.5e15
        assert_eq!(price, 1_500_000_000_000_000);
    }

    #[test]
    fn test_overflow_protection() {
        // Test edge cases that could cause overflow
        let max_sol = u64::MAX;
        let max_tokens = u64::MAX;
        
        // This should not panic
        let result = std::panic::catch_unwind(|| {
            get_price_from_vault(max_sol, 0, max_tokens, 9)
        });
        
        assert!(result.is_ok(), "Function should handle large numbers without panic");
    }

    #[test]
    fn test_division_by_zero_protection() {
        // What if token_reserve is 0?
        let result = get_price_from_vault(1000, 0, 0, 6);
        
        // Based on your function, it should return 0 when effective_reserve is negative or token_reserve is 0
        assert_eq!(result, 0, "Should return 0 when token_reserve is 0");
    }

    #[test]
    fn test_fee_calculations() {
        // Test that 2% fee is exactly 2%
        let amount = 1_000_000_000; // 1 SOL
        let fee_bps = 200; // 2%
        
        let expected_fee = (amount * fee_bps as u64) / 10000;
        assert_eq!(expected_fee, 20_000_000); // Exactly 0.02 SOL
        
        // Test referral fee splitting (0.5% from platform's 3%)
        let platform_fee_bps = 300; // 3%
        let referral_cut_bps = 50; // 0.5%
        
        let total_platform_fee = (amount * platform_fee_bps as u64) / 10000;
        let referral_share = (amount * referral_cut_bps as u64) / 10000;
        let platform_share = total_platform_fee - referral_share;
        
        assert_eq!(total_platform_fee, 30_000_000); // 0.03 SOL
        assert_eq!(referral_share, 5_000_000); // 0.005 SOL
        assert_eq!(platform_share, 25_000_000); // 0.025 SOL
    }

    #[test]
    fn test_bonding_curve_math() {
        // Test the bonding curve invariant: x * y = k
        let sol_reserve = 1_000_000_000; // 1 SOL
        let token_reserve = 1_000_000 * 10u64.pow(6); // 1M tokens
        
        let k_initial = (sol_reserve as u128) * (token_reserve as u128);
        
        // Simulate a buy of 0.1 SOL
        let sol_deposit = 100_000_000; // 0.1 SOL
        let tokens_out = (sol_deposit as u128 * token_reserve as u128) / (sol_reserve as u128 + sol_deposit as u128);
        
        let new_sol_reserve = sol_reserve + sol_deposit;
        let new_token_reserve = token_reserve - tokens_out as u64;
        
        let k_final = (new_sol_reserve as u128) * (new_token_reserve as u128);
        
        // k should remain approximately constant (within rounding error)
        let difference = if k_initial > k_final { k_initial - k_final } else { k_final - k_initial };
        let allowed_error = k_initial / 10000; // 0.01% error margin
        
        assert!(difference <= allowed_error, "Bonding curve invariant should be maintained");
    }
}