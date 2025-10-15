import { FastifyPluginAsync } from 'fastify'; 
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const devInfoRoute: FastifyPluginAsync = async (server) => {
  server.get('/dev-info/:mint', async (req, reply) => {
    const { mint } = req.params as { mint: string };

    try {
      const token = await prisma.tokenLaunch.findUnique({
        where: { mint },
      });
      if (!token) return reply.status(404).send({ error: 'Token not found' });

      const vault = await prisma.yieldVault.findUnique({
        where: { mint },
      });

      const creatorWallet = token.creator;
      const solToUsd = await getCachedSolUsdPrice();
      const LAMPORTS_PER_SOL = 1e9;

      // --- Creator holdings ---
      const devYieldPositions = await prisma.yieldPosition.findMany({
        where: { mint, isCreator: true, isOpen: true },
      });
      const devStaked = devYieldPositions.reduce(
        (sum, y) => sum + BigInt(y.deposited ?? 0n),
        0n
      );

      const devPositions = await prisma.position.findMany({
        where: { mint, userWallet: creatorWallet, isOpen: true, side: 'buy' },
      });
      const devTokensHeld = devPositions.reduce(
        (sum, p) => sum + BigInt(p.tokensOut ?? 0n),
        0n
      );

      const totalDevHoldings = devStaked + devTokensHeld;

      // --- Buy vs Sell ratio ---
      const trades = await prisma.trade.findMany({
        where: { mint, userWallet: creatorWallet },
        select: { side: true },
      });
      const buyCount = trades.filter(t => t.side === 'buy').length;
      const sellCount = trades.filter(t => t.side === 'sell').length;
      const buySellRatio = sellCount > 0 ? buyCount / sellCount : buyCount;

      // --- Share of supply ---
      const shareOfSupply =
        ((Number(totalDevHoldings) / 1_000_000)/ 1_000_000_000) * 100;

      const data = {
        mint,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image,
        createdAt: token.createdAt,

        totalStaked: Number(vault?.totalStaked ?? 0n),
        supplyAvailable: Number(vault?.tokenReserve?? 0n),

        totalEarnedFees: Number(vault?.totalEarned ?? 0n),
        totalEarnedUsd: vault && solToUsd
            ? (Number(vault?.totalEarned) / 10 ** 9) * solToUsd
            : null,
        liquidityAdded: Number(vault?.liquidityAdded ?? 0n) / LAMPORTS_PER_SOL,
        liquidityAddedUsd: vault && solToUsd
            ? (Number(vault?.liquidityAdded) / 10 ** 9) * solToUsd
            : null,
        insiderSold: Number(vault?.insiderSold ?? 0n),
        insiderBought: Number(vault?.insiderBought ?? 0n),

        totalDevHoldings: Number(totalDevHoldings),
        shareOfSupply: shareOfSupply.toFixed(2),

        devStaked: Number(devStaked),
        communityStaked:
          Number(vault?.totalStaked ?? 0n) - Number(devStaked),

        buySellRatio,
        buyCount,
        sellCount,

        lastLiquidityAdded: vault?.lastLiquidityAdded,
        lastBought: vault?.lastBought,
        lastSold: vault?.lastSold,
      };

      reply.send(data);
    } catch (err) {
      console.error('❌ Failed to fetch dev info:', err);
      reply.status(500).send({ error: 'Failed to fetch dev info' });
    }
  });
};

export default devInfoRoute;
