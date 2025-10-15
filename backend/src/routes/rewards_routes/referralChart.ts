import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

// helper for lamports -> USD
const LAMPORTS_PER_SOL = 1_000_000_000;
const toUsd = (lamports: bigint, solUsd: number) =>
  (Number(lamports) / LAMPORTS_PER_SOL) * solUsd;

// helper to generate buckets with 0s
function generateBuckets(
  start: Date,
  end: Date,
  interval: 'hour' | 'day' | 'month',
  zone: string
) {
  const buckets: Record<number, bigint> = {};
  let cursor = new Date(start);

  while (cursor <= end) {
    let ts: number;

    if (interval === 'hour') {
      ts = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        cursor.getHours()
      ).getTime();
      cursor.setHours(cursor.getHours() + 1);
    } else if (interval === 'day') {
      ts = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime();
      cursor.setDate(cursor.getDate() + 1);
    } else {
      ts = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
      cursor.setMonth(cursor.getMonth() + 1);
    }

    buckets[ts] = BigInt(0);
  }

  return buckets;
}

// group + sum
function bucketize(
  data: { amount: bigint; createdAt: Date }[],
  interval: 'hour' | 'day' | 'month'
): Record<number, bigint> {
  return data.reduce((acc, e) => {
    let ts: number;

    if (interval === 'hour') {
      ts = new Date(
        e.createdAt.getFullYear(),
        e.createdAt.getMonth(),
        e.createdAt.getDate(),
        e.createdAt.getHours()
      ).getTime();
    } else if (interval === 'day') {
      ts = new Date(
        e.createdAt.getFullYear(),
        e.createdAt.getMonth(),
        e.createdAt.getDate()
      ).getTime();
    } else {
      ts = new Date(e.createdAt.getFullYear(), e.createdAt.getMonth(), 1).getTime();
    }

    acc[ts] = (acc[ts] || BigInt(0)) + e.amount;
    return acc;
  }, {} as Record<number, bigint>);
}

const referralChartRoute: FastifyPluginAsync = async (server) => {
  server.get('/referral-chart/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      const dbUser = await prisma.user.findUnique({
        where: { wallet: user },
        select: { id: true },
      });

      if (!dbUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      const now = new Date();

      // --- Last 24h (hourly)
      const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const earnings24h = await prisma.referralEarning.findMany({
        where: {
          referrerId: dbUser.id,
          createdAt: { gte: start24h },
        },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const hourlyBuckets = {
        ...generateBuckets(start24h, now, 'hour', 'America/New_York'),
        ...bucketize(earnings24h, 'hour'),
      };
      const hourly = Object.entries(hourlyBuckets).map(([ts, amount]) => ({
        time: Number(ts),
        amount: toUsd(amount, solUsd),
      }));

      // --- Last 7d (daily)
      const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const earnings7d = await prisma.referralEarning.findMany({
        where: {
          referrerId: dbUser.id,
          createdAt: { gte: start7d },
        },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const dailyBuckets = {
        ...generateBuckets(start7d, now, 'day', 'America/New_York'),
        ...bucketize(earnings7d, 'day'),
      };
      const daily = Object.entries(dailyBuckets).map(([ts, amount]) => ({
        time: Number(ts),
        amount: toUsd(amount, solUsd),
      }));

      // --- Last 12m (monthly)
      const start12m = new Date(now);
      start12m.setMonth(now.getMonth() - 12);
      const earnings12m = await prisma.referralEarning.findMany({
        where: {
          referrerId: dbUser.id,
          createdAt: { gte: start12m },
        },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const monthlyBuckets = {
        ...generateBuckets(start12m, now, 'month', 'America/New_York'),
        ...bucketize(earnings12m, 'month'),
      };
      const monthly = Object.entries(monthlyBuckets).map(([ts, amount]) => ({
        time: Number(ts),
        amount: toUsd(amount, solUsd),
      }));

      // --- Max (total)
      const maxTotalLamports = await prisma.referralEarning.aggregate({
        where: { referrerId: dbUser.id },
        _sum: { amount: true },
      });
      const maxTotal = toUsd(maxTotalLamports._sum.amount ?? BigInt(0), solUsd);

      return reply.send({
        hourly,
        daily,
        monthly,
        max: maxTotal,
      });
    } catch (err) {
      console.error('Failed to fetch referral chart:', err);
      reply.status(500).send({ error: 'Failed to fetch referral chart' });
    }
  });
};

export default referralChartRoute;
