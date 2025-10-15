import prisma from "../../db/client";
import redis from "../../db/redis";
import { getCachedSolUsdPrice } from "../price_routes/priceService";



export async function processBuyEvent(signature: string, event: any) {
  try {
    console.log(`🔹 Processing buy event ${signature}`);

    // --- Deduplication (skip if trade already exists) ---
    const existingTrade = await prisma.trade.findUnique({
      where: { txSig: signature },
    });
    if (existingTrade) {
      console.log(`⚠️ Trade ${signature} already processed, skipping.`);
      return;
    }

    // --- Convert event data safely ---
    const blockTime = event.timestamp
      ? new Date(Number(event.timestamp) * 1000)
      : new Date();
    const solIn = BigInt(event.solIn.toString());
    const tokensOut = BigInt(event.tokensOut.toString());
    const positionId = BigInt(event.positionId.toString());
    const pendingRewards = BigInt(event.pendingRewards.toString());
    const totalEarned = BigInt(event.totalEarned.toString());
    const creatorVault = BigInt(event.creatorVault.toString());
    const referralShareSol = BigInt(event.referralShareSol.toString());
    const totalFeesEarnings = BigInt(event.totalFeesEarnings.toString());
    const platformVault = BigInt(event.platformVault.toString());
    const tokenReserve = BigInt(event.tokenReserve.toString());
    const solReserve = BigInt(event.solReserve.toString());
    const accumulatedC = BigInt(event.accumulatedC?.toString() ?? "0");
    const virtualSol = BigInt(event.virtualSol.toString());
    const virtualTokens = BigInt(event.virtualTokens.toString());
    const accRewardPerShare = BigInt(event.accRewardPerShare.toString());
    const preSaleAccFeePerShare = BigInt(event.preSaleAccFeePerShare.toString());
    const interest = BigInt(event.interest.toString());
    const preSaleFeeSol = BigInt(event.preSaleFeeSol.toString());
    const solUsd = await getCachedSolUsdPrice();

    const WSOL_DECIMALS = 9;
    const TOKEN_DECIMALS = 6;

    // --- Current price ---
    const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
    const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;
    const priceLamports = solNormalized / tokenNormalized;
    
    const qtyQuote = Number(solIn) / 1e9; // SOL
    const qtyBase = Number(tokensOut) / 1e6; // Tokens
    const tsMs = blockTime.getTime();
   
    // --- Creator check ---
    const yieldPos = await prisma.yieldPosition.findFirst({
      where: {
        mint: event.mint?.toString() ?? "",
        userWallet: event.user?.toString() ?? "",
        isCreator: true,
      },
    });

    if (yieldPos) {
      await prisma.yieldVault.update({
        where: { mint: event.mint.toString() },
        data: {
          accRewardPerShare: accRewardPerShare,
          totalEarned: totalFeesEarnings,
          creatorVault,
          platformVault,
          interestVault:interest,
          tokenReserve,
          solReserve,
          insiderBought: tokensOut,
          lastBought: blockTime,
        },
      });
    } else {
      await prisma.yieldVault.update({
        where: { mint: event.mint.toString() },
        data: { 
          accRewardPerShare: accRewardPerShare,
          totalEarned: totalFeesEarnings, 
          creatorVault, 
          platformVault,
          interestVault:interest, 
          tokenReserve, 
          solReserve,
        },
      });
    }

    // --- Vault Snapshot ---
    const prevSnapshot = await prisma.vaultSnapshot.findFirst({
      where: { mint: event.mint.toString() },
      orderBy: { blockTime: "desc" },
    });

    const volumeSolDelta = prevSnapshot
      ? solReserve > prevSnapshot.solReserve
        ? solReserve - prevSnapshot.solReserve
        : prevSnapshot.solReserve - solReserve
      : solIn;

    await prisma.position.upsert({
      where: { positionId },
      update: {
        collateral: solIn,
        tokensOut,
        entryPrice: Number(event.entryPrice.toString()),
        openedAt: blockTime,
        isOpen: true,
        openTxSig: signature,
      },
      create: {
        positionId,
        userWallet: event.user?.toString() ?? "",
        mint: event.mint?.toString() ?? "",
        side: "buy",
        entryPrice: Number(event.entryPrice.toString()),
        collateral: solIn,
        tokensOut,
        openedAt: blockTime,
        isOpen: true,
        openTxSig: signature,
      },
    });

    try {
      await prisma.vaultSnapshot.create({
        data: {
          mint: event.mint?.toString() ?? "",
          blockTime,
          txSig: signature,
          reason: "buy",
          solReserve,
          tokenReserve,
          accumulatedC,
          virtualSol,
          virtualTokens,
          priceLamports,
          volumeSolDelta,
        },
      });
    } catch (error) {
      if (error) {
        console.log(`Snapshot for tx ${signature} already exists, skipping.`);
      } else {
        throw error;
      }
    }

    // --- Redis Stream ---
    await redis.xadd(
      "ticks",
      "*",
      "mint",
      event.mint?.toString() ?? "",
      "price",
      String(priceLamports),
      "qtyQuote",
      String(qtyQuote),
      "ts",
      String(tsMs),
      "side",
      "buy"
    );

    

    try {
        // --- Trades (deduped by txSig at the top) ---
          await prisma.trade.create({
            data: {
              positionId,
              txSig: signature,
              userWallet: event.user?.toString() ?? "",
              mint: event.mint?.toString() ?? "",
              side: "buy",
              solIn,
              tokensOut,
              entryPrice:Number(event.entryPrice.toString()),
              vaultBump: event.vaultBump,
              priceSol: Number(solIn) / Number(tokensOut || 1n),
              blockTime,
            },
          });
      } catch (error) {
        if (error) {
          console.log(`Snapshot for tx ${signature} already exists, skipping.`);
        } else {
          throw error;
        }
      }

    // --- Referral Rewards ---
    const buyerWallet = event.user?.toString() ?? "";
    const buyer = await prisma.user.findUnique({
      where: { wallet: buyerWallet },
      select: { id: true, referredById: true },
    });
    if (buyer?.referredById) {
      await prisma.user.update({
        where: { id: buyer.referredById },
        data: { pendingRewards, totalEarned },
      });
      await prisma.referralEarning.create({
        data: {
          referrerId: buyer.referredById,
          referredId: buyer.id,
          amount: referralShareSol,
        },
      });
    }

    console.log("preSaleFeeSol", preSaleFeeSol);

    if (preSaleFeeSol > 0n) {
      await prisma.tokenLaunch.update({
        where: {
          mint: event.mint?.toString() ?? "",
        },
        data: {
          preSaleAccFeePerShare: preSaleAccFeePerShare,
          preSaleFeeSol: preSaleFeeSol,
        },
      });
    }
    

    console.log(`✅ Successfully processed buy event ${signature}`);
  } catch (err) {
    console.error(`❌ BuyEvent processing failed for ${signature}`, err);
  }
}
