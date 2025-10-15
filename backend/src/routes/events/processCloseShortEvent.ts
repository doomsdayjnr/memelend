import prisma from "../../db/client";
import redis from "../../db/redis";
import { getCachedSolUsdPrice } from "../price_routes/priceService";

export async function processCloseShortEvent(signature: string, event: any) {
  try {

    console.log(`🔹 Processing close short event ${signature}`);
        
    // --- Deduplication (skip if trade already exists) ---
    const existingTrade = await prisma.trade.findUnique({
        where: { txSig: signature },
    });
    if (existingTrade) {
        console.log(`⚠️ Trade ${signature} already processed, skipping.`);
        return;
    }else{
            const pendingRewards = BigInt(event.pendingRewards.toString());
            const totalEarned = BigInt(event.totalEarned.toString());
            const referralShareSol = BigInt(event.referralShareSol.toString());
            const solReserve = BigInt(event.solReserve.toString());
            const tokenReserve =  BigInt(event.tokenReserve.toString());
            const accumulatedC = BigInt(event.accumulatedCAfter.toString());
            const virtualSol = BigInt(event.virtualSol.toString());
            const virtualTokens = BigInt(event.virtualTokens.toString());
            const preSaleAccFeePerShare = BigInt(event.preSaleAccFeePerShare.toString());
            const preSaleFeeSol = BigInt(event.preSaleFeeSol.toString());
            const interest = BigInt(event.interest.toString());
            // --- Current price ---
            const WSOL_DECIMALS = 9;
            const TOKEN_DECIMALS = 6;

            // Convert to floats
            const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
            const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

            const priceLamports = solNormalized / tokenNormalized;
            const qtyQuote = Number(BigInt(event.collateralReturned.toString())) / 1e9;    
            

            let closedAt: Date;
            if (event.timestamp && 'toNumber' in event.timestamp) {
                closedAt = new Date(event.timestamp.toNumber() * 1000);
            } else {
                closedAt = new Date();
            }
            const tsMs = closedAt.getTime();

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

            // --- Update YieldVault ---
            await prisma.yieldVault.updateMany({
                where: { mint: event.mint.toString() },
                data: {
                    accRewardPerShare: BigInt(event.accRewardPerShare.toString()),
                    totalEarned: BigInt(event.totalFeesEarnings.toString()),
                    creatorVault: BigInt(event.creatorVault.toString()),
                    platformVault: BigInt(event.platformVault.toString()),
                    interestVault: interest,
                    tokenReserve: tokenReserve,
                    accumulatedC: accumulatedC,
                },
            });

            await prisma.position.updateMany({
                where: { 
                positionId: BigInt(event.positionId.toString()),
                mint: event.mint.toString(),
                },
                data: {
                pnl: BigInt(event.pnl.toString()),
                closedAt:closedAt,
                isOpen: false,
                closeTxSig:signature,
                },
            });

            // Fetch last snapshot to compute delta
            const prevSnapshot = await prisma.vaultSnapshot.findFirst({
                where: { mint: event.mint.toString() },
                orderBy: { blockTime: "desc" },
            });

            const volumeSolDelta = solReserve; // fallback to solIn if this is the first snapshot

            await prisma.vaultSnapshot.create({
            data: {
                mint: event.mint.toString(),
                blockTime: new Date(),
                txSig: signature,
                reason: "close",
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
                'side', 'close'
            );

            await prisma.shortPosition.updateMany({
            where: {
                positionId: BigInt(event.positionId.toString()),
                mint: event.mint.toString(),
            },
            data: {
                isClosed: true,
                closedAt,

                // core values
                collateralAmt: BigInt(event.collateralReturned.toString()),
                borrowedAmt: BigInt(event.repaidTokens.toString()),
                pnl: BigInt(event.pnl.toString()),
                exitPrice: Number(event.exitPrice.toString()),

                // new fields
                collateralReturned: BigInt(event.collateralReturned.toString()),
                repaidTokens: BigInt(event.repaidTokens.toString()),
                totalFees: BigInt(event.totalFees.toString()),
                interest: BigInt(event.interest.toString()),
                accumulatedCAfter: BigInt(event.accumulatedCAfter.toString()),
                closeTxSig:signature,
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
            console.log(`✅ Processed close short event ${signature}`);
    }
    
  } catch (err) {
    console.error(`❌ CloseShortEvent processing failed for ${signature}`, err);
  }
}
