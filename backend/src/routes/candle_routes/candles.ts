import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';
import redis from '../../db/redis';

const ALLOWED_INTERVALS = [
  '1s', '1m', '5m', '15m',
  '1h', '4h', '8h', '12h', '24h'
] as const;

type Interval = typeof ALLOWED_INTERVALS[number];

export type CandleResponse = {
  mint: string;
  interval: Interval;
  startTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  txCount: number;
  source?: 'db' | 'live'; // optional flag to distinguish
};

export default async function candleRoutes(server: FastifyInstance) {
  server.get('/candles', async (req, reply) => {
    const { mint, interval = '1m', limit = 500 } = req.query as {
      mint: string;
      interval?: Interval;
      limit?: number;
    };

    if (!mint) {
      return reply.code(400).send({ error: 'mint required' });
    }
    if (!ALLOWED_INTERVALS.includes(interval!)) {
      return reply.code(400).send({ error: 'bad interval' });
    }

    // Historical rows from DB (newest first)
    const dbRows = await prisma.candlestick.findMany({
      where: { mint, interval },
      orderBy: { startTime: 'desc' },
      take: Math.min(Number(limit ?? 500), 2000),
    });

    // Map into CandleResponse & reverse for ascending order
    const rows: CandleResponse[] = dbRows
      .map(r => ({
        mint: r.mint,
        interval: r.interval as Interval,
        startTime: r.startTime,
        open: Number(r.openUsd),
        high: Number(r.highUsd),
        low: Number(r.lowUsd),
        close: Number(r.closeUsd),
        volume: Number(r.volume),
        txCount: r.txCount ?? 0,
        source: 'db' as const,
      }))
      .reverse();

    // Append or replace live candle if available
    const live = await redis.hgetall(`candle:live:${interval}:${mint}`);
    if (live?.t) {
      const liveTime = new Date(Number(live.t));

      const liveCandle: CandleResponse = {
        mint,
        interval,
        startTime: liveTime,
        open: Number(live.o),
        high: Number(live.h),
        low: Number(live.l),
        close: Number(live.c),
        volume: Number(live.v),
        txCount: Number(live.tx),
        source: 'live',
      };

      if (
        rows.length &&
        rows[rows.length - 1].startTime.getTime() === liveTime.getTime()
      ) {
        // Replace last DB candle with live one
        rows[rows.length - 1] = liveCandle;
      } else {
        // Otherwise append live candle
        rows.push(liveCandle);
      }
    }

    return reply.send(rows);
  });
}
