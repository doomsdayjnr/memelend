import { FastifyPluginAsync } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const tokenInfoRoute: FastifyPluginAsync = async (server) => {
  server.get('/token-info/:mint', async (req, reply) => {
    const { mint } = req.params as { mint: string };
    console.log("mint", mint);

    try {
      // ✅ FIXED: Use proper PublicKey validation instead of isOnCurve
      try {
        new PublicKey(mint);
      } catch (err) {
        return reply.status(400).send({ error: 'Invalid mint address format' });
      }

      // 1️⃣ Find the token by mint
      const token = await prisma.tokenLaunch.findUnique({
        where: { mint },
        include: { stats: true },
      });

      // console.log("token", token);

      if (!token) {
        return reply.status(404).send({ error: 'Token not found' });
      }

      // 2️⃣ Fetch yield vault for this token
      const vault = await prisma.yieldVault.findUnique({
        where: { mint },
      });

      const solToUsd = await getCachedSolUsdPrice();

      const totalSupply = 1_000_000_000; // hardcoded supply
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

        const WSOL_DECIMALS = 9;
        const TOKEN_DECIMALS = 6;

        const solNormalized =
          Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
        const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

        currentPrice = solNormalized / tokenNormalized;
        liquidity = solNormalized;

        const circulatingSupply =
          totalSupply - Number(vault.tokenReserve) / 10 ** TOKEN_DECIMALS;
        circulatingMarketCap = currentPrice * circulatingSupply;
        fdvMarketCap = currentPrice * totalSupply;

        if (solToUsd) {
          currentPriceUsd = currentPrice * solToUsd;
          liquidityUsd = liquidity * solToUsd;
          circulatingMarketCapUsd = circulatingMarketCap * solToUsd;
          fdvMarketCapUsd = fdvMarketCap * solToUsd;
        }
      }

      const stats = {
        currentPrice,
        currentPriceUsd,
        liquidity,
        liquidityUsd,
        circulatingMarketCap,
        circulatingMarketCapUsd,
        fdvMarketCap,
        fdvMarketCapUsd,
        volume24h: token.stats?.volume24h ?? 0,
        change5m: token.stats?.change5m ?? 0,
        change1h: token.stats?.change1h ?? 0,
        change6h: token.stats?.change6h ?? 0,
        change24h: token.stats?.change24h ?? 0,
      };

      const response = {
        ...token,
        totalStaked: vault?.totalStaked.toString() || '0',
        accRewardPerShare: vault?.accRewardPerShare.toString() || '0',

        creatorVault: vault?.creatorVault.toString() || '0',
        creatorVaultUsd:
          vault && solToUsd
            ? (Number(vault.creatorVault) / 10 ** 9) * solToUsd
            : null,

        totalEarned: vault?.totalEarned.toString() || '0',
        totalEarnedUsd:
          vault && solToUsd
            ? (Number(vault.totalEarned) / 10 ** 9) * solToUsd
            : null,

        platformVault: vault?.platformVault.toString() || '0',

        interestVault: vault?.interestVault.toString() || '0',
        interestVaultUsd:
          vault && solToUsd
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

      reply.send(response);
    } catch (err) {
      console.error('Failed to fetch token info:', err);
      reply.status(500).send({ error: 'Failed to fetch token info' });
    }
  });
};

export default tokenInfoRoute;