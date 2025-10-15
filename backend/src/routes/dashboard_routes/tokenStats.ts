import { FastifyPluginAsync } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import prisma from '../../db/client';
import {getCachedSolUsdPrice} from '../price_routes/priceService';

const userTokenStateRoute: FastifyPluginAsync = async (server) => {
  server.get('/user-token-stats/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      if (!PublicKey.isOnCurve(user)) {
        return reply.status(400).send({ error: 'Invalid public key format' });
      }

      // 1️⃣ Fetch all token launches for this creator
      const userTokens = await prisma.tokenLaunch.findMany({
        where: { creator: user, isPresale: false, },
        include: { stats: true },
      });

      if (userTokens.length === 0) return reply.send([]);

      // 2️⃣ Fetch YieldVault data for all tokens
      const mintAddresses = userTokens.map(t => t.mint);
      const yieldVaults = await prisma.yieldVault.findMany({
        where: { mint: { in: mintAddresses } }
      });
      
      const solToUsd = await getCachedSolUsdPrice();
      // 3️⃣ Merge tokenLaunch + YieldVault data
      const tokensWithStats = userTokens.map( token => {
        const vault = yieldVaults.find(v => v.mint === token.mint);

        const totalSupply = 1_000_000_000; // Hardcoded 1 billion
        let currentPrice = 0;
        let liquidity = 0;
        let circulatingMarketCap = 0;
        let fdvMarketCap = 0;
        let currentPriceUsd: number | null = null;
        let liquidityUsd: number | null = null;
        let circulatingMarketCapUsd: number | null = null;
        let fdvMarketCapUsd: number | null = null;

        if (vault && vault.tokenReserve > 0n) {
          const solReserve = vault.solReserve ?? 0n;
          const accumulatedC = vault.accumulatedC ?? 0n;
          const tokenReserve = vault.tokenReserve ?? 0n;
          const virtualSol = vault.virtualSol ?? 0n;
          const virtualTokens = vault.virtualTokens ?? 0n;

          // --- Current price ---
          const WSOL_DECIMALS = 9;
          const TOKEN_DECIMALS = 6;

          // Convert to floats
          const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
          const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

          currentPrice = solNormalized / tokenNormalized;
          

          // --- Liquidity (SOL) ---
          liquidity = solNormalized;

          // --- Market Caps ---
          const circulatingSupply = totalSupply - Number(vault.tokenReserve) / 10 ** TOKEN_DECIMALS; // tokens circulating
          circulatingMarketCap = currentPrice * circulatingSupply;
          fdvMarketCap = currentPrice * totalSupply;

          // USD values if SOL price available
          
          if (solToUsd) {
            currentPriceUsd = currentPrice * solToUsd;
            liquidityUsd = liquidity * solToUsd;
            circulatingMarketCapUsd = circulatingMarketCap * solToUsd;
            fdvMarketCapUsd = fdvMarketCap * solToUsd;
          }
        }

        // Stats (overwrite DB stats with live-calculated values)
        const stats = {
          currentPrice,
          currentPriceUsd,
          liquidity,
          liquidityUsd,
          circulatingMarketCap,
          circulatingMarketCapUsd,
          fdvMarketCap,
          fdvMarketCapUsd,
          // keep historical stats if present
          volume24h: token.stats?.volume24h ?? 0,
          change5m: token.stats?.change5m ?? 0,
          change1h: token.stats?.change1h ?? 0,
          change6h: token.stats?.change6h ?? 0,
          change24h: token.stats?.change24h ?? 0,
        };

        return {
            ...token,
            // Vault data
            totalStaked: vault?.totalStaked.toString() || '0',
            accRewardPerShare: vault?.accRewardPerShare.toString() || '0',

            creatorVault: vault?.creatorVault.toString() || '0',
            creatorVaultUsd: vault && solToUsd
            ? (Number(vault.creatorVault) / 10 ** 9) * solToUsd
            : null,

            totalEarned: vault?.totalEarned.toString() || '0',
            totalEarnedUsd: vault && solToUsd
            ? (Number(vault.totalEarned) / 10 ** 9) * solToUsd
            : null,

            platformVault: vault?.platformVault.toString() || '0',

            interestVault: vault?.interestVault.toString() || '0',
            interestVaultUsd: vault && solToUsd
            ? (Number(vault.interestVault) / 10 ** 9) * solToUsd
            : null,

            tokenReserve: vault?.tokenReserve.toString() || '0',
            solReserve: vault?.solReserve.toString() || '0',
            accumulatedC: vault?.accumulatedC.toString() || '0',
            aprBps: vault?.aprBps.toString() || '0',
            lastAccrualTs: vault?.lastAccrualTs.toString() || '0',
            launchTs: vault?.launchTs.toString() || '0',
            maxWithdrawBps: vault?.maxWithdrawBps.toString() || '0',

            stats,
          };
      });

      reply.send(tokensWithStats);

    } catch (err) {
      console.error('Failed to fetch user token stats:', err);
      reply.status(500).send({ error: 'Failed to fetch token stats' });
    }
  });
};

export default userTokenStateRoute;
