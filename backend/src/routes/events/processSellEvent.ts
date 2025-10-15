import prisma from "../../db/client";
import redis from "../../db/redis";
import { getCachedSolUsdPrice } from "../price_routes/priceService";

export async function processSellEvent(signature: string, event: any) {
  try {

    console.log(`🔹 Processing sell event ${signature}`);
    
    // --- Deduplication (skip if trade already exists) ---
    const existingTrade = await prisma.trade.findUnique({
        where: { txSig: signature },
    });
    if (existingTrade) {
        console.log(`⚠️ Trade ${signature} already processed, skipping.`);
        return;
    }else{
        // Convert BNs to BigInt
        const solOut = BigInt(event.solOut.toString());
        const tokensIn = BigInt(event.tokensIn.toString());
        const blockTime = event.timestamp
        ? new Date(Number(event.timestamp) * 1000)
        : new Date();
        const pendingRewards = BigInt(event.pendingRewards.toString());
        const positionId = BigInt(event.positionId.toString());
        const totalEarned = BigInt(event.totalEarned.toString());
        const exitPrice = Number(event.exitPrice.toString())
        const totalFeesEarnings = BigInt(event.totalFeesEarnings.toString());
        const referralShareSol = BigInt(event.referralShareSol.toString());
        const tokenReserve = BigInt(event.tokenReserve.toString());
        const solReserve = BigInt(event.solReserve.toString());
        const accumulatedC = BigInt(event.accumulatedC?.toString() ?? "0");
        const creatorVault = BigInt(event.creatorVault.toString());
        const platformVault = BigInt(event.platformVault.toString());
        const referrer = event.referrer?.toBase58();
        const virtualSol = BigInt(event.virtualSol.toString());
        const virtualTokens = BigInt(event.virtualTokens.toString());
        const accRewardPerShare = BigInt(event.accRewardPerShare.toString());
        const preSaleAccFeePerShare = BigInt(event.preSaleAccFeePerShare.toString());
        const interest = BigInt(event.interest.toString());
        const preSaleFeeSol = BigInt(event.preSaleFeeSol.toString());

        // --- Current price ---
        const WSOL_DECIMALS = 9;
        const TOKEN_DECIMALS = 6;

        // Convert to floats
        const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
        const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

        const priceLamports = solNormalized / tokenNormalized;
        const qtyQuote = Number(solOut) / 1e9;    
        const tsMs = blockTime.getTime();


        // Check if seller is the creator
        const yieldPos = await prisma.yieldPosition.findFirst({
            where: {
            mint: event.mint.toString(),
            userWallet: event.user?.toString() ?? "",
            isCreator: true,
            },
        });

        if (yieldPos) {
            // Creator is selling -> accumulate insiderSold
            await prisma.yieldVault.update({
                where: { mint: event.mint.toString()},
                data: {
                    accRewardPerShare: accRewardPerShare,
                    totalEarned: totalFeesEarnings,
                    creatorVault,
                    platformVault,
                    interestVault:interest,
                    tokenReserve,
                    solReserve,
                    insiderSold: tokensIn,
                    lastSold: blockTime,
                },
            });
        } else {
            // Normal user -> no insiderSold, no lastSold
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


        await prisma.position.update({
            where: { 
            positionId,
            mint: event.mint.toString(),
            },
            data: {
            collateral:{decrement: solOut},
            tokensOut:{decrement: tokensIn},
            closedAt:blockTime,
            closeTxSig:signature,
            },
        });

        // Fetch last snapshot to compute delta
        const prevSnapshot = await prisma.vaultSnapshot.findFirst({
            where: { mint: event.mint.toString()},
            orderBy: { blockTime: "desc" },
        });

        const volumeSolDelta = prevSnapshot
            ? solReserve > prevSnapshot.solReserve
            ? solReserve - prevSnapshot.solReserve
            : prevSnapshot.solReserve - solReserve
            : solOut; // fallback to solIn if this is the first snapshot
            await prisma.vaultSnapshot.create({
                data: {
                    mint: event.mint.toString(),
                    blockTime,
                    txSig: signature,
                    reason: "sell",
                    solReserve,
                    tokenReserve,
                    accumulatedC,
                    virtualSol,
                    virtualTokens,
                    priceLamports,
                    volumeSolDelta,
                },
            });

            
        await redis.xadd(
            'ticks',
            '*',
            'mint', event.mint.toString(),
            'price', String(priceLamports),
            'qtyQuote', String(qtyQuote),
            'ts', String(tsMs),
            'side', 'sell'
        );


        // Build trade data
        const tradeData = {
            positionId,
            txSig: signature,
            userWallet: event.user?.toString() ?? "",
            mint: event.mint.toString(),
            side: 'sell',
            solOut,
            tokensIn,
            closePrice:exitPrice,
            referrer: event.referrer?.toString() ?? null,
            blockTime,
        };

        // Upsert to avoid duplicate unique constraint failures
        await prisma.trade.upsert({
            where: { txSig: tradeData.txSig },
            update: {}, // do nothing if already exists
            create: tradeData,
        });

        // --- Add rewards to referrer ---
        const buyerWallet = event.user?.toString() ?? "";

        const buyer = await prisma.user.findUnique({
            where: { wallet: buyerWallet },
            select: { id: true, referredById: true }, 
        });

        if (buyer?.referredById) {
            await prisma.user.update({
                where: { id: buyer.referredById },
                data: {
                    pendingRewards: pendingRewards,
                    totalEarned: totalEarned,
                },
            });

            await prisma.referralEarning.create({
                data: {
                    referrerId: buyer.referredById,
                    referredId: buyer.id,
                    amount: referralShareSol,
                },
            });
        }

        // Only set isOpen = false if tokensOut is 0, otherwise keep it true
        const userPosition = await prisma.position.findFirst({
            where: { 
            positionId,
            mint: event.mint.toString()
            },
        });

        if (!userPosition) return; // nothing to update

        await prisma.position.update({
            where: { 
            positionId,
            mint: event.mint.toString(),
            },
            data: {
            isOpen: userPosition.tokensOut !== BigInt(0), // true if > 0, false if 0
            },
        });

        if (preSaleFeeSol > 0n) {
            await prisma.tokenLaunch.update({
                where: {
                    mint: event.mint?.toString() ?? "",
                },
                data: {
                    preSaleAccFeePerShare,
                    preSaleFeeSol,
                },
            });
        }

        console.log(`✅ Processed Sell event ${signature}`);
    }
    
    
  } catch (err:any) {
    if (err.code === 'P2002') {
      // Unique constraint violation → already processed
      console.log(`⚠️ Sell event ${signature} already exists, skipping.`);
      return;
    }
    console.error(`❌ SellEvent processing failed for ${signature}`, err);
  }
}
