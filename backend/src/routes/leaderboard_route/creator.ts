import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const topCreatorRoute: FastifyPluginAsync = async (server) => {
  server.get('/top-creator', async (req, reply) => {
    try {
      // 1️⃣ Read pagination params
      const page = Number((req.query as any).page) || 1;
      const pageSize = Number((req.query as any).pageSize) || 50; // default 50
      const skip = (page - 1) * pageSize;

      // 2️⃣ Aggregate YieldVault by creator
      const creatorsAgg = await prisma.yieldVault.groupBy({
        by: ['creator'],
        _sum: { totalEarned: true },
        _count: { id: true },
        orderBy: { _sum: { totalEarned: 'desc' } },
        skip,
        take: pageSize,
      });

      // 3️⃣ Count total creators for pagination
      const totalCreators = await prisma.yieldVault.groupBy({
        by: ['creator'],
        _sum: { totalEarned: true },
      });

      if (creatorsAgg.length === 0) {
        return reply.send({
          success: true,
          data: [],
          meta: { total: 0, totalPages: 0, page, pageSize },
        });
      }

      // 4️⃣ Enrich with user info (username)
      const leaderboard = await Promise.all(
        creatorsAgg.map(async (entry, index) => {
          const user = await prisma.user.findUnique({
            where: { wallet: entry.creator },
            select: { username: true },
          });

          return {
            rank: skip + index + 1,
            creator: `${entry.creator.slice(0, 4)}...${entry.creator.slice(-4)}`, // shorten wallet
            wallet: entry.creator,
            username: user?.username || 'Unknown',
            totalEarned: Number(entry._sum.totalEarned ?? 0) / 1e9, // lamports → SOL
            tokensLaunched: entry._count.id, // number of YieldVaults
          };
        })
      );

      // 5️⃣ Pagination metadata
      const total = totalCreators.length;
      const totalPages = Math.ceil(total / pageSize);

      return reply.send({
        success: true,
        data: leaderboard,
        meta: { total, totalPages, page, pageSize },
      });
    } catch (err) {
      console.error('Error fetching top creator earners:', err);
      return reply
        .status(500)
        .send({ success: false, message: 'Failed to fetch creator leaderboard' });
    }
  });
};

export default topCreatorRoute;
