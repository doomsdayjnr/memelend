import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const allReferralRoute: FastifyPluginAsync = async (server) => {
  server.get('/all-referral/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      // Find the referrer
      const dbUser = await prisma.user.findUnique({
        where: { wallet: user },
        select: { id: true },
      });

      if (!dbUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Get all ReferralEarning entries for this user as referrer
      const referralEarnings = await prisma.referralEarning.findMany({
        where: { referrerId: dbUser.id },
        select: {
          referred: {
            select: {
              wallet: true,
              username: true,
            },
          },
          amount: true, // this comes as string
        },
      });

      const solUsd = await getCachedSolUsdPrice();
        if (solUsd === 0) {
            console.warn('❌ SOL price is 0');
            return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
        }
      

      const LAMPORTS_PER_SOL = 1_000_000_000;

      // Group by referred user
      const grouped: Record<string, { wallet: string; username: string; totalAmount: bigint }> = {};
      for (const re of referralEarnings) {
        const key = re.referred.wallet;
        const amt = BigInt(re.amount); // convert string to BigInt
        if (!grouped[key]) {
          grouped[key] = {
            wallet: re.referred.wallet,
            username: re.referred.username,
            totalAmount: BigInt(0),
          };
        }
        grouped[key].totalAmount += amt; // sum in BigInt
      }

      // Convert to array and format to SOL (as number)
      const result = Object.values(grouped).map((r) => ({
        wallet: `${r.wallet.slice(0, 5)}...${r.wallet.slice(-5)}`,
        username: r.username,
        totalAmount: Number(r.totalAmount) / LAMPORTS_PER_SOL * solUsd, // divide by LAMPORTS_PER_SOL
      }));

      return reply.send(result);
    } catch (err) {
      console.error('Failed to fetch referral earnings:', err);
      reply.status(500).send({ error: 'Failed to fetch referral earnings' });
    }
  });
};

export default allReferralRoute;
