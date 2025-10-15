import { FastifyPluginAsync } from 'fastify';
import { PublicKey, LAMPORTS_PER_SOL, Connection, clusterApiUrl } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import * as anchor from '@coral-xyz/anchor';
import {getCachedSolUsdPrice} from '../price_routes/priceService';

interface VaultConfig {
  mint: PublicKey;
  tokenReserve: anchor.BN;
  solReserve: anchor.BN;
  accumulatedC: anchor.BN;
  virtualSol: anchor.BN;
  virtualTokens: anchor.BN;
  bump: number;
}

const goShortPrePreviewRoute: FastifyPluginAsync = async (server) => {
  server.get('/short-pre-preview', async (req, reply) => {
    const { mint, collateralAmount, user, slippage, collateralPercent } = req.query as {
      mint: string;
      collateralAmount: string;
      user: string;
      slippage: number;
      collateralPercent: number;
    };


    if (!mint || !collateralAmount || !user) {
      return reply.send({
        success: true,
        claimable: 0,
        message: "❌ Missing mint, collateralAmount, or user in query"
      });
    }

    try {
      const mintKey = new PublicKey(mint);
      const solUsd = await getCachedSolUsdPrice();

      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );


      const vaultConfigAccount = await (program.account as any).vaultConfig.fetch(vaultConfig) as VaultConfig;

      const tokenReserveBN = new anchor.BN(vaultConfigAccount.tokenReserve.toString());
      const solReserveBN = new anchor.BN(vaultConfigAccount.solReserve.toString());
      const accumulatedCBN = new anchor.BN(vaultConfigAccount.accumulatedC.toString());
      const virtualSolBN = new anchor.BN(vaultConfigAccount.virtualSol.toString());
      const virtualTokensBN = new anchor.BN(vaultConfigAccount.virtualTokens.toString());
   

      // Normalize decimals
        const tokenDecimals = 6;
        const solDecimals = 9;
      
        const tokenReserveNormalized = tokenReserveBN.toNumber() / 10 ** tokenDecimals;
        const virtualTokensNormalized = virtualTokensBN.toNumber() / 10 ** tokenDecimals;
        const solReserveNormalized = solReserveBN.toNumber() / 10 ** solDecimals;
        const accumulatedCNormalized = accumulatedCBN.toNumber() / 10 ** solDecimals;
        const virtualSolNormalized = virtualSolBN.toNumber() / 10 ** solDecimals;

        const effectiveTokenReserve = tokenReserveNormalized + virtualTokensNormalized;
      
          // Price in SOL = (solReserve + accumulatedC) / tokenReserve
        const priceInSol = (solReserveNormalized + accumulatedCNormalized + virtualSolNormalized) / effectiveTokenReserve;
      
        if (solUsd === 0) {
          return reply.send({
            success: true,
            claimable: 0,
            message: "❌ Failed to fetch SOL/USD price"
          });
        }
      
        const priceInUsd = priceInSol * solUsd;
      

      if (tokenReserveBN.isZero() || solReserveBN.isZero()) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "❌ Insufficient liquidity in vaults"
          });
      }

      const TOKEN_DECIMALS = 6;
      const MAX_BORROWABLE_PCT = 20; // Max 20% of token reserve per short to avoid draining vaults

      const rawCollateralBN = new anchor.BN(collateralAmount);
      const feeAdjustedCollateralBN = rawCollateralBN.muln(93).divn(100);


      // Apply 200% collateral logic: only 50% of provided SOL is used for borrowable amount
      const collateralPercentBN = new anchor.BN(Math.floor(collateralPercent));
      const effectiveInputBN = feeAdjustedCollateralBN.mul(collateralPercentBN).divn(100);

      const effectiveSolReserveBN = solReserveBN.add(accumulatedCBN).add(virtualSolBN); 
      const effectiveTokenReserveBN = tokenReserveBN.add(virtualTokensBN);

      // Calculate tokensOut using bonding curve integration
      const tokensOutBN = effectiveTokenReserveBN.sub(
        effectiveTokenReserveBN.mul(effectiveSolReserveBN).div(effectiveSolReserveBN.add(effectiveInputBN))
      );

      const [lendingVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_lending'), mintKey.toBuffer()],
        program.programId
      );

      const MAX_SHORT_LENDING_RATIO_BPS = 2000; // 20%
      const lendingVaultTokenAccount = await getAccount(program.provider.connection, lendingVault);
      const lendingVaultAmountBN = new anchor.BN(lendingVaultTokenAccount.amount.toString());


      const maxAllowedTokensOutBN = lendingVaultAmountBN.muln(MAX_SHORT_LENDING_RATIO_BPS).divn(10_000);
      if (tokensOutBN.gt(maxAllowedTokensOutBN)) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "❌ This trade exceeds the maximum SOL limit. Please lower the amount."
          });
      }

      const maxBorrowable = lendingVaultAmountBN.muln(MAX_BORROWABLE_PCT).divn(100);

      if (tokensOutBN.gt(maxBorrowable)) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "❌ Short position too large for current liquidity. Try a smaller amount."
          });
      }

      // Slippage calculation
      const minTokensOutBN = tokensOutBN.muln(10_000 - slippage).divn(10_000);

      // Price per token (based on current state, not average across curve)
      const priceLamportsPerToken = effectiveSolReserveBN
        .mul(new anchor.BN(10 ** TOKEN_DECIMALS))
        .div(tokenReserveBN);

      return reply.send({
        success: true,
        tokensOut: tokensOutBN.toString(),
        priceInUsd,
        priceInSol,
        solUsd,
      });
    } catch (error) {
      console.error('❌ Short preview error:', error);
      return reply.status(500).send({ success: false, claimable: 0, message: error });
    }
  });
};

export default goShortPrePreviewRoute;
