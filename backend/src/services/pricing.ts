import prisma from '../db/client';
import { getCachedSolUsdPrice } from '../routes/price_routes/priceService';

export async function fetchCurrentPrice(mint: string): Promise<number> {
  try {
    // 1️⃣ Fetch the YieldVault record for this mint
    const vault = await prisma.yieldVault.findUnique({
      where: { mint },
    });

    if (!vault) {
      throw new Error(`No YieldVault found for mint ${mint}`);
    }

    // 2️⃣ Convert BigInt fields to numbers
    const tokenReserve = Number(vault.tokenReserve ?? 0n);
    const solReserve = Number(vault.solReserve ?? 0n);
    const accumulatedC = Number(vault.accumulatedC ?? 0n);
    const virtualSol = Number(vault.virtualSol ?? 0n);
    const virtualTokens = Number(vault.virtualTokens ?? 0n);

    // 3️⃣ Handle insufficient liquidity
    if (tokenReserve === 0 || solReserve === 0) {
      throw new Error(`Insufficient liquidity for mint ${mint}`);
    }

    // 4️⃣ Normalize decimals
    const tokenDecimals = 6; // adjust if your token has different decimals
    const solDecimals = 9;

    const tokenReserveNormalized = tokenReserve / 10 ** tokenDecimals;
    const virtualTokensNormalized = virtualTokens / 10 ** tokenDecimals;
    const solReserveNormalized = solReserve / 10 ** solDecimals;
    const accumulatedCNormalized = accumulatedC / 10 ** solDecimals;
    const virtualSolNormalized = virtualSol / 10 ** solDecimals;

    const effectiveTokenReserve = tokenReserveNormalized + virtualTokensNormalized;

    // 5️⃣ Calculate price in SOL
    const priceInSol = (solReserveNormalized + accumulatedCNormalized + virtualSolNormalized) / effectiveTokenReserve;

    // 6️⃣ Convert to USD
    const solUsd = await getCachedSolUsdPrice();
    if (!solUsd || solUsd === 0) throw new Error('Failed to fetch SOL/USD price');

    const priceInUsd = priceInSol * solUsd;

    return priceInUsd;
  } catch (err) {
    console.error('❌ fetchCurrentPrice (DB) failed:', err);
    return 0;
  }
}
