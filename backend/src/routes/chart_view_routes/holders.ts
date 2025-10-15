import { FastifyPluginAsync } from 'fastify'; 
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const holdersRoute: FastifyPluginAsync = async (server) => {
  server.get('/holders/:mint', async (req, reply) => {
    const { mint } = req.params as { mint: string };

    try {
      // Fetch all open positions for the mint
      const positions = await prisma.position.findMany({
        where: { 
          mint,
          isOpen: true,
          side: 'buy', // only token holders, exclude shorts
        },
      });

      // Fetch all active yield positions for the mint
      const yieldPositions = await prisma.yieldPosition.findMany({
        where: { 
          mint,
          isOpen: true,
        },
      });

      // Combine both sets of holders
      const holdersMap: Record<string, number> = {};
      const holdersMapIsCreator: Record<string, boolean> = {};

      for (const pos of positions) {
        const tokensOut = pos.tokensOut ? Number(pos.tokensOut) : 0;
        holdersMap[pos.userWallet] = (holdersMap[pos.userWallet] ?? 0) + tokensOut;
      }

      for (const y of yieldPositions) {
        const deposited = y.deposited ? Number(y.deposited) : 0;
        holdersMap[y.userWallet] = (holdersMap[y.userWallet] ?? 0) + deposited;
        if (y.isCreator) {
          holdersMapIsCreator[y.userWallet] = true;
        }
      }

      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      // Token info (only need for this mint)
      const tokenLaunch = await prisma.tokenLaunch.findUnique({
        where: { mint },
        select: { mint: true, image: true, name: true, symbol: true },
      });

      const tokenName = tokenLaunch?.name ?? '';
      const tokenSymbol = tokenLaunch?.symbol ?? '';
      const tokenImage = tokenLaunch?.image ?? null;

      // Final unified holders list
      let formattedHolders = Object.entries(holdersMap).map(([wallet, totalTokens]) => ({
        wallet,
        mint,
        tokenName,
        tokenSymbol,
        tokenImage,
        totalTokens,
        isCreator: holdersMapIsCreator[wallet] ?? false,
      }));

      // ✅ Sort descending by totalTokens
      formattedHolders = formattedHolders.sort((a, b) => b.totalTokens - a.totalTokens);

      // ✅ Add rank field
      formattedHolders = formattedHolders.map((holder, index) => ({
        ...holder,
        rank: index + 1,
        valueUsd: (holder.totalTokens / 1_000_000) * solUsd, // optional, you can calculate here
        pctOfSupply: ((holder.totalTokens / 1_000_000) / 1_000_000_000) * 100, // optional
      }));

      reply.send(formattedHolders);

    } catch (err) {
      console.error('❌ Failed to fetch holders from DB:', err);
      reply.status(500).send({ error: 'Failed to fetch holders' });
    }
  });
};

export default holdersRoute;
