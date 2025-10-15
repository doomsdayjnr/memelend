import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const shortedRoutes: FastifyPluginAsync = async (server) => {
  server.get('/shorted', async (req, reply) => {
    try {
      // 1️⃣ Pagination
      const page = Number((req.query as any).page) || 1;
      const pageSize = Number((req.query as any).pageSize) || 5;
      const skip = (page - 1) * pageSize;

      // 2️⃣ Group shorts by token
      const groupedShorts = await prisma.position.groupBy({
        by: ['mint'],
        where: {
          side: 'short',
          isOpen: true,
        },
        _sum: {
          collateral: true, // 👈 ranking metric
        },
        orderBy: {
          _sum: { collateral: 'desc' },
        },
        skip,
        take: pageSize,
      });

      if (groupedShorts.length === 0) {
        return reply.send({
          data: [],
          meta: { total: 0, totalPages: 0, page, pageSize },
        });
      }

      // 3️⃣ Count total unique shorted tokens
      const total = await prisma.position.groupBy({
        by: ['mint'],
        where: { side: 'short', isOpen: true },
        _sum: { collateral: true },
      });
      const totalPages = Math.ceil(total.length / pageSize);

      // 4️⃣ Fetch TokenLaunch + stats for those mints
      const mintAddresses = groupedShorts.map((s) => s.mint);
      const tokens = await prisma.tokenLaunch.findMany({
        where: { mint: { in: mintAddresses }, status: 'active' },
        include: { stats: true },
      });

      // 5️⃣ Fetch YieldVaults
      const yieldVaults = await prisma.yieldVault.findMany({
        where: { mint: { in: mintAddresses } },
      });

      // 6️⃣ Get SOL→USD conversion
      const solToUsd = await getCachedSolUsdPrice();

      // 7️⃣ Enrich tokens
      const enrichedTokens = tokens.map((token) => {
        const vault = yieldVaults.find((v) => v.mint === token.mint);
        const shortInfo = groupedShorts.find((s) => s.mint === token.mint);

        const totalSupply = 1_000_000_000; // hardcoded
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
          const virtualSol = vault.virtualSol ?? 0n;
          const tokenReserve = vault.tokenReserve ?? 0n;
          const virtualTokens = vault.virtualTokens ?? 0n;

          const WSOL_DECIMALS = 9;
          const TOKEN_DECIMALS = 6;

          const solNormalized =
            Number(virtualSol + solReserve + accumulatedC) / 10 ** WSOL_DECIMALS;
          const tokenNormalized =
            Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

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

        return {
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          mint: token.mint,
          image: token.image,
          createdAt: token.createdAt,

          // Live calculated stats
          currentPrice,
          currentPriceUsd,
          liquidity,
          liquidityUsd,
          circulatingMarketCap,
          circulatingMarketCapUsd,
          fdvMarketCap,
          fdvMarketCapUsd,

          // Shorts exposure
          totalShortCollateral: shortInfo?._sum.collateral ?? 0,

          // Keep stats
          volume24h: token.stats?.volume24h ?? 0,
          change5m: token.stats?.change5m ?? 0,
          change1h: token.stats?.change1h ?? 0,
          change6h: token.stats?.change6h ?? 0,
          change24h: token.stats?.change24h ?? 0,
        };
      });

      return reply.send({
        data: enrichedTokens,
        meta: { total: total.length, page, pageSize, totalPages },
      });
    } catch (err) {
      console.error('Failed to fetch shorted tokens:', err);
      reply.status(500).send({ error: 'Failed to fetch shorted tokens' });
    }
  });
};

export default shortedRoutes;
