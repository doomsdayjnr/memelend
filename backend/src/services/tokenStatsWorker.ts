import prisma from "./../db/client";
import redis from "./../db/redis";
import { getCachedSolUsdPrice } from "../routes/price_routes/priceService";

const WSOL_DECIMALS = 9;
const DEFAULT_TOKEN_DECIMALS = 6;

function toNumberSafe(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function computePercentChange(mint: string, nowCloseUsd: number, minutesAgo: number) {
  try {
    const target = new Date(Date.now() - minutesAgo * 60_000);
    const past = await prisma.candlestick.findFirst({
      where: { mint, interval: "1m", startTime: { lte: target } },
      orderBy: { startTime: "desc" },
      select: { close: true },
    });
    if (!past || !past.close) return 0;
    const pastClose = Number(past.close);
    if (pastClose === 0) return 0;
    return ((nowCloseUsd - pastClose) / pastClose) * 100;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 0;
  }
}

async function updateStatsForMint(mint: string, closeUsdFromCandle: number) {
  try {
    const solUsd = await getCachedSolUsdPrice();
    const closeUsd = Number(closeUsdFromCandle || 0);
    let priceSol = solUsd > 0 ? closeUsd / solUsd : 0;

    const latestVault = await prisma.vaultSnapshot.findFirst({
      where: { mint },
      orderBy: { blockTime: "desc" },
    });

    let liquiditySol = 0;
    let vaultPriceLamports: number | null = null;
    if (latestVault) {
      const virtualSol = toNumberSafe((latestVault as any).virtualSol);
      const solReserve = toNumberSafe((latestVault as any).solReserve);
      const accC = toNumberSafe((latestVault as any).accumulatedC);
      liquiditySol = (solReserve + accC + virtualSol) / 10 ** WSOL_DECIMALS;
      if (latestVault.priceLamports) vaultPriceLamports = Number(latestVault.priceLamports);
    }

    if ((!priceSol || !isFinite(priceSol) || priceSol === 0) && vaultPriceLamports) {
      priceSol = vaultPriceLamports;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const trades24h = await prisma.trade.findMany({
      where: { mint, blockTime: { gte: since } },
      select: { side: true, solIn: true, userWallet: true },
    });

    let volumeLamports = 0;
    let buyCount = 0;
    let sellCount = 0;
    const makerSet = new Set<string>();
    for (const t of trades24h) {
      volumeLamports += toNumberSafe((t as any).solIn);
      if (t.side === "buy") buyCount++;
      if (t.side === "sell") sellCount++;
      if ((t as any).userWallet) makerSet.add((t as any).userWallet);
    }
    const volume24h = volumeLamports / 1e9;

    const closeUsdNum = closeUsd;
    const [change5m, change1h, change6h, change24h] = await Promise.all([
      computePercentChange(mint, closeUsdNum, 5),
      computePercentChange(mint, closeUsdNum, 60),
      computePercentChange(mint, closeUsdNum, 360),
      computePercentChange(mint, closeUsdNum, 1440),
    ]);

    const tokenLaunch = await prisma.tokenLaunch.findUnique({
      where: { mint },
    });

    if (!tokenLaunch) {
      console.warn(`tokenStatsWorker: no TokenLaunch row for mint ${mint} — skipping TokenStats upsert.`);
      return;
    }

    const fullToken = await prisma.tokenLaunch.findUnique({ where: { mint } }) as any;
    const possibleSupply =
      fullToken?.supply ??
      fullToken?.totalSupply ??
      fullToken?.tokenSupply ??
      fullToken?.initialSupply ??
      fullToken?.mintSupply ??
      0;

    const decimals =
      fullToken?.decimals ??
      fullToken?.tokenDecimals ??
      DEFAULT_TOKEN_DECIMALS;

    const supplyNormalized = Number(possibleSupply || 0) / 10 ** Number(decimals || DEFAULT_TOKEN_DECIMALS);
    const marketCapSol = priceSol * supplyNormalized;
    const marketCapUsd = marketCapSol * solUsd;

    const buysToSells = sellCount > 0 ? buyCount / sellCount : buyCount;
    const makers = makerSet.size;

    await prisma.tokenStats.upsert({
      where: { mint },
      update: {
        currentPrice: priceSol,
        currentPriceUsd: closeUsdNum,
        liquidity: liquiditySol,
        liquidityUsd: liquiditySol * solUsd,
        marketCap: marketCapSol,
        marketCapUsd,
        volume24h,
        buyCount24h: buyCount,
        sellCount24h: sellCount,
        buysToSells,
        makers,
        change5m,
        change1h,
        change6h,
        change24h,
      },
      create: {
        mint,
        currentPrice: priceSol,
        currentPriceUsd: closeUsdNum,
        liquidity: liquiditySol,
        liquidityUsd: liquiditySol * solUsd,
        marketCap: marketCapSol,
        marketCapUsd,
        volume24h,
        buyCount24h: buyCount,
        sellCount24h: sellCount,
        buysToSells,
        makers,
        change5m,
        change1h,
        change6h,
        change24h,
      },
    });

    console.log(`✅ tokenStatsWorker: updated TokenStats for ${mint}`);
  } catch (err) {
    console.error("tokenStatsWorker:updateStatsForMint error:", err instanceof Error ? err.message : String(err));
  }
}

export async function startTokenStatsWorker() {
  const sub = redis.duplicate ? redis.duplicate() : redis;

  try {
    await (sub as any).connect?.();
  } catch {
    // ignore
  }

  // Subscribe to chart_updates
  try {
    if (typeof (sub as any).subscribe === "function") {
      await (sub as any).subscribe("chart_updates", async (message: string) => {
        try {
          if (!message) return;
          const parsed = JSON.parse(message);
          if (!parsed?.isFinal || parsed?.interval !== "1m" || !parsed?.mint) return;

          const mint: string = parsed.mint;
          const close = Number(parsed.close ?? 0);
          await updateStatsForMint(mint, close);
        } catch (err) {
          console.error("tokenStatsWorker: subscribe handler error:", err instanceof Error ? err.message : String(err));
        }
      });
      console.log("tokenStatsWorker: subscribed to chart_updates");
    }
  } catch (err) {
    console.error("tokenStatsWorker: failed to subscribe:", err instanceof Error ? err.message : String(err));
  }

  // Periodically recalc all tokens to ensure change5m/1h/6h/24h updates
  setInterval(async () => {
    try {
      const tokens = await prisma.tokenLaunch.findMany({ select: { mint: true } });
      for (const t of tokens) {
        const latestCandle = await prisma.candlestick.findFirst({
          where: { mint: t.mint, interval: "1m" },
          orderBy: { startTime: "desc" },
        });
        if (latestCandle) {
          await updateStatsForMint(t.mint, Number(latestCandle.close));
        }
      }
    } catch (err) {
      console.error("tokenStatsWorker: periodic update error:", err instanceof Error ? err.message : String(err));
    }
  }, 60_000); // every 1 min
}
