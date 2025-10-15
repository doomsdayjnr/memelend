import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const LAMPORTS_PER_SOL = 1_000_000_000;

const profitChartStatsRoute: FastifyPluginAsync = async (server) => {
  server.get('/profit-stats/:user', async (req, reply) => {
    const { user } = req.params as { user: string };
    const now = new Date();

    try {
      const solUsdPrice = await getCachedSolUsdPrice(); 
      if (solUsdPrice === 0) {
        console.warn("❌ SOL price is 0");
        return reply.status(502).send({ error: "Failed to fetch SOL/USD price" });
      }

      // --- helper to fetch trades only once per interval
      async function getTradesSince(start: Date) {
        return prisma.trade.findMany({
          where: {
            userWallet: user,
            blockTime: { gte: start },
          },
          select: {
            positionId: true,
            side: true,
            solIn: true,
            solOut: true,
            blockTime: true,
          },
          orderBy: { blockTime: "asc" },
        });
      }

      // --- helper to bucketize PnL
      function calculateBuckets(
        trades: Awaited<ReturnType<typeof getTradesSince>>,
        interval: "hour" | "day" | "month",
        count: number
      ) {
        const result: { time: number; pnlUsd: number }[] = [];

        // generate aligned bucket timestamps
        let start = new Date(now);
        if (interval === "hour") start.setHours(start.getHours() - count);
        if (interval === "day") start.setDate(start.getDate() - count);
        if (interval === "month") start.setMonth(start.getMonth() - count);

        const buckets: Record<number, { solIn: bigint; solOut: bigint }> = {};
        let cursor = new Date(start);

        for (let i = 0; i < count; i++) {
          let ts: number;
          let bucketEnd: Date;

          if (interval === "hour") {
            ts = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate(),
              cursor.getHours()
            ).getTime();
            bucketEnd = new Date(cursor);
            bucketEnd.setHours(bucketEnd.getHours() + 1);
            cursor = bucketEnd;
          } else if (interval === "day") {
            ts = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate()
            ).getTime();
            bucketEnd = new Date(cursor);
            bucketEnd.setDate(bucketEnd.getDate() + 1);
            cursor = bucketEnd;
          } else {
            ts = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
            bucketEnd = new Date(cursor);
            bucketEnd.setMonth(bucketEnd.getMonth() + 1);
            cursor = bucketEnd;
          }

          buckets[ts] = { solIn: BigInt(0), solOut: BigInt(0) };
        }

        // group by positionId per bucket
        for (const trade of trades) {
          if (!trade.positionId) continue;

          let ts: number;
          if (interval === "hour") {
            ts = new Date(
              trade.blockTime.getFullYear(),
              trade.blockTime.getMonth(),
              trade.blockTime.getDate(),
              trade.blockTime.getHours()
            ).getTime();
          } else if (interval === "day") {
            ts = new Date(
              trade.blockTime.getFullYear(),
              trade.blockTime.getMonth(),
              trade.blockTime.getDate()
            ).getTime();
          } else {
            ts = new Date(
              trade.blockTime.getFullYear(),
              trade.blockTime.getMonth(),
              1
            ).getTime();
          }

          // accumulate by position
          const key = trade.positionId.toString();
          if (!buckets[ts]) continue;

          if (trade.solIn) buckets[ts].solIn += BigInt(trade.solIn);
          if (trade.solOut) buckets[ts].solOut += BigInt(trade.solOut);
        }

        // compute realized pnl
        for (const [ts, { solIn, solOut }] of Object.entries(buckets)) {
          const pnlLamports = solOut - solIn;
          const pnlUsd = (Number(pnlLamports) / LAMPORTS_PER_SOL) * solUsdPrice;
          result.push({ time: Number(ts), pnlUsd });
        }

        return result;
      }

      // fetch trades for each window just once
      const trades24h = await getTradesSince(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      const trades7d = await getTradesSince(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const trades30d = await getTradesSince(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      const trades12m = await getTradesSince(new Date(new Date().setMonth(now.getMonth() - 12)));

      return reply.send({
        last24h: calculateBuckets(trades24h, "hour", 24),
        last7d: calculateBuckets(trades7d, "day", 7),
        last30d: calculateBuckets(trades30d, "day", 30),
        last12mo: calculateBuckets(trades12m, "month", 12),
      });
    } catch (err) {
      console.error("Failed to fetch profit stats:", err);
      reply.status(500).send({ error: "Failed to fetch profit stats" });
    }
  });
};

export default profitChartStatsRoute;
