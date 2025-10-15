import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const topReferralRoute: FastifyPluginAsync = async (server) => {
  server.get('/top-referral', async (req, reply) => {
    try {
      // 1️⃣ Read pagination params
      const page = Number((req.query as any).page) || 1;
      const pageSize = Number((req.query as any).pageSize) || 50; // default 50
      const skip = (page - 1) * pageSize;

      // 2️⃣ Count total referrers
      const total = await prisma.user.count();

      if (total === 0) {
        return reply.send({
          success: true,
          data: [],
          meta: { total: 0, totalPages: 0, page, pageSize },
        });
      }

      // 3️⃣ Fetch paginated referrers ordered by totalEarned
      const referrers = await prisma.user.findMany({
        orderBy: { totalEarned: 'desc' },
        skip,
        take: pageSize,
        include: {
          referrals: true,
          referralEarningsFrom: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // 4️⃣ Map into leaderboard format
      const leaderboard = referrers.map((u, index) => ({
        rank: skip + index + 1, // offset rank by skipped results
        username: u.username,
        wallet: `${u.wallet.slice(0, 4)}...${u.wallet.slice(-4)}`,
        referralsCount: u.referrals.length,
        totalEarned: Number(u.totalEarned ?? 0) / 1e9, // lamports → SOL
        pendingRewards: Number(u.pendingRewards ?? 0) / 1e9, // lamports → SOL
        lastReferralDate: u.referralEarningsFrom[0]?.createdAt ?? null,
      }));

      // 5️⃣ Pagination metadata
      const totalPages = Math.ceil(total / pageSize);

      return reply.send({
        success: true,
        data: leaderboard,
        meta: { total, totalPages, page, pageSize },
      });
    } catch (err) {
      console.error('Error fetching top referrals:', err);
      return reply
        .status(500)
        .send({ success: false, message: 'Failed to fetch referral leaderboard' });
    }
  });
};

export default topReferralRoute;
