import redis from '../../db/redis';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

// Intervals you want to support
const ROLLOUPS = ['1m','5m','15m','1h','4h','8h','12h','24h'] as const;
type Interval = '1s'|'1m'|'5m'|'15m'|'1h'|'4h'|'8h'|'12h'|'24h';

const floorTo = (tsMs: number, ms: number) => tsMs - (tsMs % ms);

const msFor = (interval: Interval) => {
  switch (interval) {
    case '1s':  return 1000;
    case '1m':  return 60_000;
    case '5m':  return 5 * 60_000;
    case '15m': return 15 * 60_000;
    case '1h':  return 60 * 60_000;
    case '4h':  return 4 * 60 * 60_000;
    case '8h':  return 8 * 60 * 60_000;
    case '12h': return 12 * 60 * 60_000;
    case '24h': return 24 * 60 * 60_000;
    default: throw new Error(`bad interval: ${interval}`);
  }
};

async function applyTickToLive(
  mint: string,
  interval: Interval,
  tick: { ts: number; price: number; qtyQuote: number }
) {
  const key = `candle:live:${interval}:${mint}`;
  const bucketStart = floorTo(tick.ts, msFor(interval));

  const current = await redis.hgetall(key);
  const solUsdPrice = await getCachedSolUsdPrice();
  const priceUsd = tick.price * solUsdPrice;

  const publishCandle = (c: Record<string, string>, isFinal = false) => {
    const o = Number(c.o);
    const h = Number(c.h);
    const l = Number(c.l);
    const cPrice = c.c ? Number(c.c) : o; // fallback
    const v = Number(c.v);
    const tx = Number(c.tx);

    // FIX: Ensure timestamp is valid before creating Date
    const timestamp = Number(c.t);
    if (isNaN(timestamp)) {
      console.error('Invalid timestamp in candle data:', c.t);
      return;
    }

    redis.publish(
      "chart_updates",
      JSON.stringify({
        mint,
        interval,
        startTime: new Date(timestamp),
        open: o,
        high: h,
        low: l,
        close: cPrice,
        volume: v,
        txCount: tx,
        isFinal,
      })
    );
  };

  if (!current.t) {
    // 🆕 First candle for this interval
    const newCandle = {
      t: String(bucketStart),
      o: String(priceUsd),
      h: String(priceUsd),
      l: String(priceUsd),
      c: String(priceUsd),
      v: String(tick.qtyQuote),
      tx: "1",
    };
    await redis.hset(key, newCandle);
    publishCandle(newCandle);
    return;
  }

  const t0 = Number(current.t);
  if (bucketStart !== t0) {
    // ✅ Finalize previous bucket
    await finalizeLive(mint, interval, current);

    // 📌 Carry forward the last close into the new open
    const prevClose = Number(current.c) || Number(current.o);

    const newCandle = {
      t: String(bucketStart),
      o: String(prevClose), // 👈 continuity fix
      h: String(Math.max(prevClose, priceUsd)),
      l: String(Math.min(prevClose, priceUsd)),
      c: String(priceUsd),
      v: String(tick.qtyQuote),
      tx: "1",
    };

    await redis.hset(key, newCandle);
    publishCandle(newCandle);
    return;
  }

  // ✅ Update in-progress candle
  const open = Number(current.o);
  const h = Math.max(Number(current.h), priceUsd);
  const l = Math.min(Number(current.l), priceUsd);
  const c = priceUsd; // last trade price
  const v = Number(current.v) + tick.qtyQuote;
  const tx = Number(current.tx) + 1;

  const updated = {
    t: String(t0),
    o: String(open),
    h: String(h),
    l: String(l),
    c: String(c),
    v: String(v),
    tx: String(tx),
  };

  await redis.hset(key, updated);
  publishCandle(updated);
}


async function finalizeLive(mint: string, interval: Interval, live: Record<string,string>) {
  // ✅ Align to bucketStart for consistency
  const bucketStart = floorTo(Number(live.t), msFor(interval));

  // FIX: Validate timestamp before creating Date
  if (isNaN(bucketStart) || bucketStart <= 0) {
    console.error('Invalid bucketStart timestamp:', live.t);
    return;
  }

  const startTime = new Date(bucketStart);

  // FIX: Validate the Date object
  if (isNaN(startTime.getTime())) {
    console.error('Invalid startTime created from bucketStart:', bucketStart);
    return;
  }

  const open = Number(live.o);
  const high = Number(live.h);
  const low = Number(live.l);
  const close = live.c ? Number(live.c) : open; // ✅ fallback
  const volume = Number(live.v);
  const txCount = Number(live.tx);

  const data = {
    mint,
    interval,
    startTime,
    open,
    high,
    low,
    close,
    volume,
    txCount,
    openUsd: open,
    highUsd: high,
    lowUsd: low,
    closeUsd: close,
  };

 try {

    await prisma.candlestick.upsert({
      where: { mint_interval_startTime: { mint, interval, startTime } },
      update: {
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        txCount: data.txCount,
      },
      create: data,
    });

    // ✅ Always publish aligned & complete candle
    await redis.publish('chart_updates', JSON.stringify({
      mint,
      interval,
      startTime: startTime.toISOString(),
      open: data.openUsd,
      high: data.highUsd,
      low: data.lowUsd,
      close: data.closeUsd,
      volume: data.volume,
      txCount: data.txCount,
      isFinal: true,
    }));

  } catch (error) {
    console.error('Error in finalizeLive:', error);
    return; // Don't proceed to rollup if there's an error
  }

  if (interval === '1s') {
    await rollupFrom1s(mint, live);
  }
}


async function rollupFrom1s(mint: string, oneSec: Record<string,string>) {
  const solUsdPrice = await getCachedSolUsdPrice();
  const oneTs = Number(oneSec.t);

  // FIX: Validate oneTs before using it
  if (isNaN(oneTs) || oneTs <= 0) {
    console.error('Invalid oneSec timestamp:', oneSec.t);
    return;
  }

  for (const tf of ROLLOUPS) {
    const tfMs = msFor(tf);
    const bucketStart = floorTo(oneTs, tfMs);
    const key = `candle:live:${tf}:${mint}`;
    const live = await redis.hgetall(key);

    const publishCandle = (c: Record<string,string>, isFinal = false) => {
      const o = Number(c.o), h = Number(c.h), l = Number(c.l), cPrice = Number(c.c);
      const v = Number(c.v), tx = Number(c.tx);

       // FIX: Validate timestamp before creating Date
        const timestamp = Number(c.t);
        if (isNaN(timestamp)) {
          console.error('Invalid timestamp in rollup candle data:', c.t);
          return;
        }

      const candleData = {
        mint,
        interval: tf,
        startTime: new Date(timestamp), // ✅ always aligned to bucketStart
        open: o,
        high: h,
        low: l,
        close: cPrice,
        volume: v,
        txCount: tx,
        isFinal,
      };

      redis.publish('chart_updates', JSON.stringify(candleData));
    };

    if (!live.t || Number(live.t) !== bucketStart) {
    // ✅ finalize the previous candle if it exists
    if (live.t) {
      // FIX: Validate live.t before finalizing
      const liveTimestamp = Number(live.t);
      if (!isNaN(liveTimestamp) && liveTimestamp > 0) {
        await finalizeLive(mint, tf, live);
      }
    }

      // ✅ start a new candle aligned to bucketStart
      const newCandle = {
        t: String(bucketStart),
        o: oneSec.o,
        h: oneSec.h,
        l: oneSec.l,
        c: oneSec.c,
        v: oneSec.v,
        tx: oneSec.tx,
      };

      await redis.hset(key, newCandle);
      publishCandle(newCandle); // ✅ use bucketStart, not oneSec.t
    } else {
      // ✅ update the in-progress candle
      const h = Math.max(Number(live.h), Number(oneSec.h));
      const l = Math.min(Number(live.l), Number(oneSec.l));
      const v = Number(live.v) + Number(oneSec.v);
      const tx = Number(live.tx) + Number(oneSec.tx);

      const updated = {
        ...live,
        h: String(h),
        l: String(l),
        c: oneSec.c,
        v: String(v),
        tx: String(tx),
      };

      await redis.hset(key, updated);
      publishCandle(updated);
    }
  }
}

async function consumeTicks() {
  let lastId = '0';

  while (true) {
    try {
      const streams = await redis.xread(
        'COUNT', '100',
        'BLOCK', '5000',
        'STREAMS', 'ticks', lastId
      );

      if (!streams) continue;

      for (const [streamName, entries] of streams) {
        for (const [id, flatFields] of entries) {
          const fields: Record<string, string> = {};
          for (let i = 0; i < flatFields.length; i += 2) {
            fields[flatFields[i]] = flatFields[i + 1];
          }

          const mint = fields.mint;
          const tick = {
            ts: Number(fields.ts),
            price: Number(fields.price),
            qtyQuote: Number(fields.qtyQuote),
          };

          // FIX: Validate tick data before processing
          if (mint && !isNaN(tick.ts) && tick.ts > 0) {
            await applyTickToLive(mint, '1s', tick);
          } else {
            console.error('Invalid tick data:', { mint, ts: fields.ts });
          }
          lastId = id;
        }
      }
    } catch (err) {
      console.error('❌ Error consuming ticks:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export { applyTickToLive, finalizeLive, rollupFrom1s, consumeTicks };

