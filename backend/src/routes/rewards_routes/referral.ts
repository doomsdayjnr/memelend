import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const referralRoute: FastifyPluginAsync = async (server) => {
  server.get('/referral-rewards/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      // Find the user by wallet
      const dbUser = await prisma.user.findUnique({
        where: { wallet: user },
        select: {
          pendingRewards: true,
          totalEarned: true,
        },
      });

      if (!dbUser) {
        return reply.status(404).send({ error: 'User not found' });
      }
      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }
      

      const LAMPORTS_PER_SOL = 1_000_000_000;

      // Convert BigInt to SOL and format to 4 decimals
      const pendingRewardsUsd = dbUser.pendingRewards
        ? Number(dbUser.pendingRewards) / LAMPORTS_PER_SOL * solUsd
        : 0;
      const totalEarnedUsd = dbUser.totalEarned
        ? Number(dbUser.totalEarned) / LAMPORTS_PER_SOL * solUsd
        : 0;

      return reply.send({
        pendingRewards: pendingRewardsUsd.toFixed(2),
        totalEarned: totalEarnedUsd.toFixed(2),
      });
    } catch (err) {
      console.error('Failed to fetch referral rewards:', err);
      reply.status(500).send({ error: 'Failed to fetch referral rewards' });
    }
  });
};

export default referralRoute;
