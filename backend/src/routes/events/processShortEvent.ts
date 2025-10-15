import prisma from "../../db/client";
import redis from "../../db/redis";
import { getCachedSolUsdPrice } from "../price_routes/priceService";

export async function processShortEvent(signature: string, event: any) {
  try {

    console.log(`🔹 Processing short event ${signature}`);
    
    // --- Deduplication (skip if trade already exists) ---
    const existingTrade = await prisma.trade.findUnique({
        where: { txSig: signature },
    });
    if (existingTrade) {
        console.log(`⚠️ Trade ${signature} already processed, skipping.`);
        return;
    }else{

        const blockTime = event.timestamp
        ? new Date(Number(event.timestamp) * 1000)
        : new Date();
        const collateralAmt = BigInt(event.collateralAmt.toString());
        const borrowedAmt = BigInt(event.borrowedAmt.toString());
        const positionId = BigInt(event.positionId.toString());
        const openPrice = Number(event.openPrice.toString());
        const liquidationPrice = Number(event.liquidationPrice.toString());
        const pendingRewards = BigInt(event.pendingRewards.toString());
        const totalEarned = BigInt(event.totalEarned.toString());
        const creatorVault = BigInt(event.creatorVault.toString());
        const platformVault = BigInt(event.platformVault.toString());
        const totalFeesEarnings = BigInt(event.totalFeesEarnings.toString());
        const referralShareSol = BigInt(event.referralShareSol.toString());
        const tokenReserve = BigInt(event.tokenReserve.toString());
        const solReserve = BigInt(event.solReserve.toString());
        const accumulatedC = BigInt(event.accumulatedC.toString());
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
        const qtyQuote = Number(collateralAmt) / 1e9;    
        const tsMs = blockTime.getTime();
        

        // --- Update YieldVault ---
        const mintString = event.mint.toString();
        await prisma.yieldVault.update({
            where: { mint: mintString },
            data: {
                accRewardPerShare: accRewardPerShare,
                totalEarned: totalFeesEarnings,
                creatorVault,
                platformVault,
                interestVault:interest,
                tokenReserve,
            },
        });

        await prisma.position.upsert({
            where: { positionId },
            update: {}, 
            create: {
                positionId,
                userWallet: event.user.toString(),
                mint: event.mint.toString(),
                side: 'short',
                entryPrice: openPrice,
                collateral:collateralAmt,
                tokensOut: borrowedAmt,
                liquidationPrice: liquidationPrice,
                openedAt:blockTime,
                isOpen: true,
                openTxSig:signature,
            },
        });

        const shortData = {
            positionId,
            userWallet: event.user.toString(),
            collateralAmt,
            borrowedAmt,
            openPrice,
            liquidationPrice,
            openedAt:blockTime,
            mint: event.mint.toString(),
            openTxSig:signature,
            isClosed: false,
            isLiquidated: false,
        };

        // Fetch last snapshot to compute delta
        const prevSnapshot = await prisma.vaultSnapshot.findFirst({
            where: { mint: event.mint.toString() },
            orderBy: { blockTime: "desc" },
        });

        const volumeSolDelta = prevSnapshot
            ? solReserve > prevSnapshot.solReserve
            ? solReserve - prevSnapshot.solReserve
            : prevSnapshot.solReserve - solReserve
            : collateralAmt; 
            await prisma.vaultSnapshot.create({
                data: {
                    mint: event.mint.toString(),
                    blockTime: blockTime,
                    txSig: signature,
                    reason: "short",
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
            'side', 'short'
        );

        await prisma.shortPosition.upsert({
            where: {
                positionId_mint: {
                    positionId: shortData.positionId,
                    mint: shortData.mint,
                },
            },
            update: {},
            create: shortData,
        });

            // --- Add rewards to referrer ---
        const buyerWallet = event.user.toString();

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
        console.log(`✅ Processed short event ${signature}`);
    }
    
  } catch (err) {
    console.error(`❌ ShortEvent processing failed for ${signature}`, err);
  }
}
