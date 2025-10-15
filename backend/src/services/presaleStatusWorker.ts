import prisma from "../db/client";
import cron from "node-cron";
import redis from "../db/redis";

async function checkPresaleStatuses() {
  const now = new Date();

  try {
    // 1️⃣ Find all presale tokens where presaleEnd has passed
    const presales = await prisma.tokenLaunch.findMany({
      where: {
        isPresale: true,
        presaleEnd: { lte: now },
      },
    });

    for (const token of presales) {
      const presaleSol = BigInt(token.presaleSol || 0n);
      const mint = token.mint;
      const ts = Date.now();

      if (presaleSol > 0n) {
        // 🏦 Load yield vault for this mint
        const yieldVault = await prisma.yieldVault.findUnique({
          where: { mint },
        });

        if (!yieldVault) {
          console.warn(`⚠️ No yieldVault found for mint ${mint}, skipping.`);
          continue;
        }

        // --- Parse vault reserves safely ---
        const tokenReserve = BigInt(yieldVault.tokenReserve.toString());
        const solReserve = BigInt(yieldVault.solReserve.toString());
        const virtualSol = BigInt(yieldVault.virtualSol.toString());
        const virtualTokens = BigInt(yieldVault.virtualTokens.toString());
        const accumulatedC = BigInt(yieldVault.accumulatedC?.toString() ?? "0");

        // --- Compute current price ---
        const WSOL_DECIMALS = 9;
        const TOKEN_DECIMALS = 6;
        const solNormalized =
          Number(solReserve + accumulatedC + virtualSol) /
          10 ** WSOL_DECIMALS;
        const tokenNormalized =
          Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

        const priceLamports =
          tokenNormalized > 0 ? solNormalized / tokenNormalized : 0;

        // ✅ Presale had funds → activate the token
        await prisma.tokenLaunch.update({
          where: { id: token.id },
          data: {
            status: "active",
            isPresale: false,
            createdAt:new Date(ts),
          },
        });

        // 🧠 Also mark vault as live if desired
        await prisma.yieldVault.update({
          where: { mint },
          data: { isLive: true, lastLiquidityAdded: new Date(ts) },
        });

        // 🪣 Push first tick to Redis stream
        await redis.xadd(
          "ticks",
          "*",
          "mint", mint,
          "price", String(priceLamports),
          "qtyQuote", String(presaleSol),
          "ts", String(ts),
          "side", "liquidity"
        );

        console.log(
          `✅ Token ${token.symbol} activated & tick added. (price=${priceLamports.toFixed(
            8
          )})`
        );
      } else {
        // ❌ No presale funds → disable presale
        await prisma.tokenLaunch.update({
          where: { id: token.id },
          data: { isPresale: false },
        });
        console.log(
          `⚠️ Token ${token.symbol} presale ended with zero SOL, set isPresale = false.`
        );
      }
    }
  } catch (err) {
    console.error("❌ Presale worker error:", err);
  }
}

// ⏰ Run every minute
cron.schedule("* * * * *", async () => {
  await checkPresaleStatuses();
});
