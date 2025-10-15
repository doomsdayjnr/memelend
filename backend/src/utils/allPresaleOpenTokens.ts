import { PublicKey } from '@solana/web3.js';
import prisma from '../db/client';
import { getCachedSolUsdPrice } from '../routes/price_routes/priceService';

export async function fetchOpenPresales(): Promise<any[]> {
  // 1️⃣ Fetch presale tokens still open for contribution
  const now = new Date();
  const presales = await prisma.tokenLaunch.findMany({
    where: {
      isPresale: true,
      status: 'pending', // or "presale" depending on how you track it
      presaleStart: { lte: now },
    },
  });

  // 2️⃣ Get cached SOL→USD price
  const solUsd = await getCachedSolUsdPrice();

  // 3️⃣ Format presale data for your bot or frontend
  return presales.map((token) => {
    try {
      const presaleEntryPriceUsd = token.presaleEntryPrice ?? 0;
      const presaleSolRaised = Number(token.presaleSol ?? 0n) / 1_000_000_000;
      const presalePercent = token.presalePercent ?? 0;
      const presaleAmount = token.presaleAmount ?? "0";

      return {
        pubkey: new PublicKey(token.mint),
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        image: token.image,
        creator: token.creator,
        presaleEntryPriceUsd,
        presalePercent,
        presaleAmount,
        presaleSolRaised,
        presaleAmountLeftOver: token.presaleAmountLeftOver ?? "0",
        presaleFeeSol: Number(token.preSaleFeeSol ?? 0n) / 1_000_000_000,
        presaleStart: token.presaleStart,
        presaleEnd: token.presaleEnd,
        presaleSol: token.presaleSol,
        solUsd,
        lendPercent: token.lendPercent,
        liquidityVault: token.liquidityVault,
        lendingVault: token.lendingVault,
        wsolVault: token.wsolVault,
      };
    } catch (err) {
      console.error('❌ Failed to format presale from DB:', err);
      return null;
    }
  }).filter(Boolean);
}
