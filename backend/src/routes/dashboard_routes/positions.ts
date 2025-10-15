import { FastifyPluginAsync } from 'fastify'; 
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const positionsRoute: FastifyPluginAsync = async (server) => {
  server.get('/positions/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      // Fetch all open positions for the user
      const positions = await prisma.position.findMany({
        where: { 
          userWallet: user,
          isOpen: true,
          isPresale: false,
        },
        orderBy: { openedAt: 'desc' },
      });

      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      // Fetch the TokenLaunch entries for all mints in positions
      const mints = positions.map(p => p.mint);
      const tokenLaunches = await prisma.tokenLaunch.findMany({
        where: { mint: { in: mints } },
        select: { mint: true, image: true, name: true, symbol: true }
      });

      // Map mint → TokenLaunch data for easy lookup
      const tokenMap = new Map(tokenLaunches.map(t => [t.mint, t]));

      const formattedPositions = positions.map((pos) => {
        const mintDecimals = 6;
        const entrySolPrice = Number(pos.entryPrice) / 1e9 / 10 ** mintDecimals;
        const entryUsdPrice = entrySolPrice * solUsd;
        const formattedUsd = entryUsdPrice.toFixed(8);
        const collateral = pos.collateral ? Number(pos.collateral) : 0;
        const borrowed = pos.borrowed ? Number(pos.borrowed) : 0;
        const tokensOut = pos.tokensOut ? Number(pos.tokensOut) : 0;
        const liquidateUsdPrice = pos.liquidationPrice ? (Number(pos.liquidationPrice) / 1_000_000_000) : 0;

        // Get token image (or fallback to null)
        const tokenInfo = tokenMap.get(pos.mint);
        const tokenImage = tokenInfo?.image || null;
        const tokenName = tokenInfo?.name || '';
        const tokenSymbol = tokenInfo?.symbol || '';

        return {
          positionId: pos.positionId.toString(),
          mint: pos.mint,
          tokenName,
          tokenSymbol,
          tokenImage,
          side: pos.side,
          entryPrice: formattedUsd,
          collateral,
          borrowedTokens: borrowed,
          tokensOut,
          liquidate: liquidateUsdPrice,
          openedAt: pos.openedAt,
          closedAt: pos.closedAt,
          isOpen: pos.isOpen,
          pnl: pos.pnl ? Number(pos.pnl) : 0,
          currentPnl: pos.currentPnl ? Number(pos.currentPnl) : 0,
          openTxSig: pos.openTxSig,
        };
      });

      reply.send(formattedPositions);

    } catch (err) {
      console.error('❌ Failed to fetch positions from DB:', err);
      reply.status(500).send({ error: 'Failed to fetch positions' });
    }
  });
};

export default positionsRoute;
