import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const subcategoryTokensRoute: FastifyPluginAsync = async (server) => {
  server.get('/subcategory/:id/tokens', async (req, reply) => {
    const { id } = req.params as { id: string };

    try {

        // Fetch the subcategory along with tokens
        const subcategory = await prisma.subCategory.findUnique({
        where: { id: parseInt(id) },
        select: { id: true, name: true },
        });

        if (!subcategory) {
        return reply.status(404).send({ error: 'Subcategory not found' });
        }

        // 1️⃣ Read pagination params
        const page = Number((req.query as any).page) || 1;
        const pageSize = Number((req.query as any).pageSize) || 5;
        const skip = (page - 1) * pageSize;

        // 2️⃣ Count total active tokens
        const total = await prisma.tokenLaunch.count({
            where: {
            categories: {
                some: {
                subCategoryId: parseInt(id),
                tokenLaunch: { status: 'active' }
                }
            }
            },
        });
    
        if (total === 0) return reply.send({ data: [], meta: { total: 0, totalPages: 0, page, pageSize } });

        // 3️⃣ Fetch latest active tokens with pagination
        const tokens = await prisma.tokenLaunch.findMany({
        where: {
                categories: {
                    some: {
                    subCategoryId: parseInt(id),
                    tokenLaunch: { status: 'active' }
                    }
                }
            },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
            stats: true,
        },
        });
        // 4️⃣ Fetch YieldVaults for those tokens
      const mintAddresses = tokens.map((t) => t.mint);
      const yieldVaults = await prisma.yieldVault.findMany({
        where: { mint: { in: mintAddresses } },
      });

      // 5️⃣ Get SOL→USD conversion
      const solToUsd = await getCachedSolUsdPrice();

      // 6️⃣ Enrich tokens with live stats
      const enrichedTokens = tokens.map((token) => {
        const vault = yieldVaults.find((v) => v.mint === token.mint);

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
          const virtualSol = vault.virtualSol ?? 0n;
          const tokenReserve = vault.tokenReserve ?? 0n;
          const virtualTokens = vault.virtualTokens ?? 0n;

          const WSOL_DECIMALS = 9;
          const TOKEN_DECIMALS = 6;

          const solNormalized = Number(virtualSol + solReserve + accumulatedC) / 10 ** WSOL_DECIMALS;
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

          // Keep historical stats if present
          volume24h: token.stats?.volume24h ?? 0,
          change5m: token.stats?.change5m ?? 0,
          change1h: token.stats?.change1h ?? 0,
          change6h: token.stats?.change6h ?? 0,
          change24h: token.stats?.change24h ?? 0,
        };
      });

      // 7️⃣ Return paginated response
      const totalPages = Math.ceil(total / pageSize);

      return reply.send({
        subcategory,
        data: enrichedTokens,
        meta: {
          total,
          page,
          pageSize,
          totalPages,
        },
      });
    } catch (err: any) {
      console.error('Failed to fetch tokens:', err);
      return reply.status(500).send({ error: err.message });
    }
  });
};

export default subcategoryTokensRoute;
