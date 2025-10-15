import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const historyListRoute: FastifyPluginAsync = async (server) => {
  server.get('/history/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    // 1️⃣ Fetch trades
    const trades = await prisma.trade.findMany({
      where: { userWallet: user },
      orderBy: { blockTime: 'asc' },
    });

    // 2️⃣ Fetch short positions
    const shorts = await prisma.shortPosition.findMany({
      where: { userWallet: user },
      orderBy: { openedAt: 'asc' },
    });

    if ((!trades || trades.length === 0) && (!shorts || shorts.length === 0)) {
      return reply.send([]);
    }

    
    const solUsdPrice = await getCachedSolUsdPrice();
    

    // 3️⃣ Collect unique mints from both trades and shorts
    const uniqueMints = [
      ...new Set([
        ...trades.map((t) => t.mint),
        ...shorts.map((s) => s.mint),
      ]),
    ];

    // 4️⃣ Fetch token metadata
    const tokenLaunches = await prisma.tokenLaunch.findMany({
      where: { mint: { in: uniqueMints } },
      select: {
        mint: true,
        name: true,
        symbol: true,
        image: true,
        uri: true,
        decimals: true,
      },
    });

    const tokenInfoMap = new Map(tokenLaunches.map((tl) => [tl.mint, tl]));

    const positions: any[] = [];

    // 5️⃣ Process normal trades (buy/sell)
    const tradeGroups = new Map<string, typeof trades>();
    for (const t of trades) {
      const key = t.positionId ? String(t.positionId) : `tx:${t.txSig}`;
      if (!tradeGroups.has(key)) tradeGroups.set(key, []);
      tradeGroups.get(key)!.push(t);
    }

    for (const [key, posTrades] of tradeGroups.entries()) {
      const hasBuy = posTrades.some((t) => t.side.toLowerCase() === 'buy');
      const hasSell = posTrades.some((t) => t.side.toLowerCase() === 'sell');
      if (!(hasBuy && hasSell)) continue; // only closed positions

      const totalSolIn = posTrades.reduce((s, t) => s + Number(t.solIn ?? 0), 0);
      const totalSolOut = posTrades.reduce((s, t) => s + Number(t.solOut ?? 0), 0);
      const totalTokensIn = posTrades.reduce((s, t) => s + Number(t.tokensIn ?? 0), 0);
      const totalTokensOut = posTrades.reduce((s, t) => s + Number(t.tokensOut ?? 0), 0);

      const buyTrades = posTrades.filter((t) => t.side.toLowerCase() === 'buy');
      const sellTrades = posTrades.filter((t) => t.side.toLowerCase() === 'sell');
      const entryTrade = buyTrades.reduce((a, b) => (a.blockTime < b.blockTime ? a : b));
      const closeTrade = sellTrades[sellTrades.length - 1];

      const entryTime = entryTrade.blockTime;
      const closeTime = closeTrade.blockTime;

      const pnlLamports = totalSolOut - totalSolIn;
      const pnlSol = pnlLamports / 1_000_000_000;
      const pnlUsd = solUsdPrice != null ? pnlSol * solUsdPrice : null;

      const avgEntryPriceSolPerToken =
        totalTokensOut > 0 ? (totalSolIn / totalTokensOut) / 1_000_000_000 : null;
      const avgExitPriceSolPerToken =
        totalTokensIn > 0 ? (totalSolOut / totalTokensIn) / 1_000_000_000 : null;

      const mint = posTrades[0].mint;
      const tokenInfo = tokenInfoMap.get(mint);

      let entryPriceUsd: number | null = null;
      let closePriceUsd: number | null = null;
      const mintDecimals = 6;
      if (solUsdPrice != null) {
        if (entryTrade.entryPrice != null) entryPriceUsd = Number(entryTrade.entryPrice / 1e9 / 10 ** mintDecimals) * solUsdPrice;
        if (closeTrade?.closePrice != null) closePriceUsd = Number(closeTrade.closePrice / 1e9 / 10 ** mintDecimals) * solUsdPrice;
      }

      const tradesSimplified = posTrades.map((t) => ({
        txSig: t.txSig,
        side: t.side,
        blockTime: t.blockTime.toISOString(),
        solInLamports: Number(t.solIn ?? 0),
        solOutLamports: Number(t.solOut ?? 0),
        tokensIn: t.tokensIn?.toString() ?? null,
        tokensOut: t.tokensOut?.toString() ?? null,
        priceSol: t.priceSol ?? null,
        entryPrice: t.entryPrice ?? null,
        closePrice: t.closePrice ?? null,
      }));

      positions.push({
        positionKey: key,
        positionId: posTrades[0].positionId ? String(posTrades[0].positionId) : null,
        status: 'closed',
        entryTime: entryTime.toISOString(),
        closeTime: closeTime.toISOString(),
        totalSolInLamports: totalSolIn,
        totalSolOutLamports: totalSolOut,
        totalTokensInRaw: String(totalTokensIn),
        totalTokensOutRaw: String(totalTokensOut),
        pnlSol,
        pnlUsd,
        avgEntryPriceSolPerToken,
        avgExitPriceSolPerToken,
        entryPriceUsd,
        closePriceUsd,
        mint,
        tokenName: tokenInfo?.name ?? null,
        tokenSymbol: tokenInfo?.symbol ?? null,
        tokenImage: tokenInfo?.image ?? null,
        tokenUri: tokenInfo?.uri ?? null,
        tokenDecimals: tokenInfo?.decimals ?? null,
        trades: tradesSimplified,
      });
    }

    // 6️⃣ Process short positions
    for (const s of shorts) {
      if (!s.isClosed && !s.isLiquidated) {
        // skip open shorts
        continue;
      }
      const mint = s.mint;
      const tokenInfo = tokenInfoMap.get(mint);
      const entryTime = s.openedAt;
      const closeTime = s.closedAt ?? s.openedAt;
      const forfeitedCollateralSol = s.forfeitedCollateral ? Number(s.forfeitedCollateral) / 1_000_000_000 : 0;
      const forfeitedCollateralUsd = solUsdPrice != null ? forfeitedCollateralSol * solUsdPrice : null;
      const pnlSol = s.pnl ? Number(s.pnl) / 1_000_000_000 : 0;
      const pnlUsd = solUsdPrice != null ? pnlSol * solUsdPrice : null;
      const mintDecimals = 6;
      const openPriceSol =  Number(s.openPrice) / 1e9 / 10 ** mintDecimals;
      const openPriceUsd =  openPriceSol * solUsdPrice;
      const formattedUsd =  openPriceUsd.toFixed(8);

      const exitPriceSol =  Number(s.exitPrice) / 1e9 / 10 ** mintDecimals;
      const exitPriceUsd =  exitPriceSol * solUsdPrice;
      const formattedExitPriceUsd =  exitPriceUsd.toFixed(8);
      const liquidateUsdPrice = s.liquidationPrice ? (Number(s.liquidationPrice) / 1_000_000_000) : 0;

      positions.push({
        positionKey: `short:${s.positionId}`,
        positionId: String(s.positionId),
        status: s.isLiquidated ? 'liquidated' : 'closed',
        entryTime: entryTime.toISOString(),
        closeTime: s.closedAt?.toISOString() ?? null,
        totalCollateralLamports: Number(s.collateralAmt),
        totalBorrowedLamports: Number(s.borrowedAmt),
        totalRepaidTokens: s.repaidTokens?.toString() ?? null,
        totalFeesLamports: s.totalFees?.toString() ?? null,
        pnlSol,
        pnlUsd,
        forfeitedCollateralUsd,
        openPriceUsd: formattedUsd,
        closePriceUsd: formattedExitPriceUsd,
        liquidationPriceSol: liquidateUsdPrice,
        mint,
        tokenName: tokenInfo?.name ?? null,
        tokenSymbol: tokenInfo?.symbol ?? null,
        tokenImage: tokenInfo?.image ?? null,
        tokenUri: tokenInfo?.uri ?? null,
        tokenDecimals: tokenInfo?.decimals ?? null,
        txSigs: {
          open: s.openTxSig ?? null,
          close: s.closeTxSig ?? null,
        },
      });
    }

    // 7️⃣ Sort by closeTime desc
    positions.sort((a, b) => {
      const aTime = a.closeTime ? new Date(a.closeTime).getTime() : 0;
      const bTime = b.closeTime ? new Date(b.closeTime).getTime() : 0;
      return bTime - aTime;
    });

    return reply.send(positions);
  });
};

export default historyListRoute;
