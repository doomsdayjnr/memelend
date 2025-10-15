import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { fetchCurrentPrice } from '../../services/pricing';

const unrealizedPnLRoute: FastifyPluginAsync = async (server) => {
  server.get('/unrealized-pnl/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    // 1. Fetch all OPEN positions for this user
    const positions = await prisma.position.findMany({
      where: { userWallet: user, isOpen: true },
    });

    if (positions.length === 0) {
      return reply.send({
        totalCollateral: 0,
        totalUnrealizedPnL: 0,
        totalUnrealizedPnLUsd: 0,
      });
    }

    // 2. Fetch TokenStats for all mints in these positions
    const mints = [...new Set(positions.map(p => p.mint))];
    const stats = await prisma.tokenStats.findMany({
      where: { mint: { in: mints } },
    });
    const statMap = new Map(stats.map(s => [s.mint, s]));

    const solUsdPrice = await getCachedSolUsdPrice();

    let totalCollateral = 0;
    let totalUnrealizedPnL = 0;
    const priceCache = new Map<string, number>();

    for (const pos of positions) {
      if (!pos.entryPrice || pos.entryPrice === 0) continue;

      const mintKey = pos.mint;
      let currentPrice = priceCache.get(mintKey);

      if (!currentPrice) {
        currentPrice = await fetchCurrentPrice(mintKey);
        priceCache.set(mintKey, currentPrice);
      }

      const mintDecimals = 6;
      const entryPriceSOL = Number(pos.entryPrice) / 1e9 / 10 ** mintDecimals; // stored value
      const currentPriceUSD = currentPrice; // from fetchCurrentPrice()
      const currentPriceSOL = currentPriceUSD / solUsdPrice; // convert to SOL

      // currentPrice is already in USD from fetchCurrentPrice()
      const collateralLamports = Number(pos.collateral ?? 0);
      const collateral = collateralLamports / LAMPORTS_PER_SOL;

      let pnl = 0;
      if (pos.side.toLowerCase() === 'buy') {
        pnl = ((currentPriceSOL - entryPriceSOL) / entryPriceSOL) * collateral;
      } else if (pos.side.toLowerCase() === 'short') {
        pnl = ((entryPriceSOL - currentPriceSOL) / entryPriceSOL) * collateral;
      }

      totalCollateral += collateral;
      totalUnrealizedPnL += pnl;
    }

    return reply.send({
      totalCollateral,                        // in SOL
      totalUnrealizedPnL,                     // in SOL
      totalUnrealizedPnLUsd: totalUnrealizedPnL * solUsdPrice, // in USD
    });
  });
};

export default unrealizedPnLRoute;
