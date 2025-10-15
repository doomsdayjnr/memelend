import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const presalePositionsRoute: FastifyPluginAsync = async (server) => {
  server.get('/presale-positions/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      // --- 1. Fetch all open presale positions for the user ---
      const positions = await prisma.position.findMany({
        where: {
          userWallet: user,
          isOpen: true,
          isPresale: true,
        },
        orderBy: { openedAt: 'desc' },
      });

      if (positions.length === 0) {
        return reply.send([]);
      }

      // --- 2. Fetch SOL/USD price ---
      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      // --- 3. Fetch TokenLaunch entries for all mints ---
      const mints = positions.map((p) => p.mint);
      const tokenLaunches = await prisma.tokenLaunch.findMany({
        where: { mint: { in: mints } },
        select: {
          mint: true,
          image: true,
          name: true,
          symbol: true,
          preSaleAccFeePerShare: true,
        },
      });

      // Map mint → TokenLaunch
      const tokenMap = new Map(tokenLaunches.map((t) => [t.mint, t]));

      // --- 4. Compute formatted positions ---
      const formattedPositions = positions.map((pos) => {
        const tokenInfo = tokenMap.get(pos.mint);
        const preSaleAccFeePerShare = BigInt(tokenInfo?.preSaleAccFeePerShare ?? 0n);
        const feeDebt = BigInt(pos.feeDebt ?? 0n);
        const tokensOut = BigInt(pos.tokensOut ?? 0n);

        const PRECISION = 1_000_000_000_000n; // 1e12

        // --- Calculate pending reward (same as on-chain formula) ---
        let pending = 0n;
        try {
          pending =
            (tokensOut * preSaleAccFeePerShare) / PRECISION - feeDebt;
          if (pending < 0n) pending = 0n; // no negatives
        } catch {
          pending = 0n;
        }

        // Format display fields
        const mintDecimals = 6;
        const pendingTokens = Number(pending) / 1e9 / 10 ** mintDecimals;
        const pendingUsd = pendingTokens * solUsd;
        const entrySolPrice = Number(pos.entryPrice) / 1e9 / 10 ** mintDecimals;
        const entryUsdPrice = entrySolPrice * solUsd;
        const formattedUsd = entryUsdPrice.toFixed(8);

        const collateral = pos.collateral ? Number(pos.collateral) : 0;
        const borrowed = pos.borrowed ? Number(pos.borrowed) : 0;
        const liquidateUsdPrice = pos.liquidationPrice
          ? Number(pos.liquidationPrice) / 1_000_000_000
          : 0;

        return {
          positionId: pos.positionId.toString(),
          mint: pos.mint,
          tokenName: tokenInfo?.name ?? '',
          tokenSymbol: tokenInfo?.symbol ?? '',
          tokenImage: tokenInfo?.image ?? null,
          side: pos.side,
          entryPrice: formattedUsd,
          collateral,
          borrowedTokens: borrowed,
          tokensOut: Number(tokensOut),
          openedAt: pos.openedAt,
          closedAt: pos.closedAt,
          isOpen: pos.isOpen,
          pnl: pos.pnl ? Number(pos.pnl) : 0,
          currentPnl: pos.currentPnl ? Number(pos.currentPnl) : 0,
          openTxSig: pos.openTxSig,
          // --- new field ---
          pendingRewards: Number(pendingUsd), 
        };
      });

      reply.send(formattedPositions);
    } catch (err) {
      console.error('❌ Failed to fetch positions from DB:', err);
      reply.status(500).send({ error: 'Failed to fetch positions' });
    }
  });
};

export default presalePositionsRoute;
