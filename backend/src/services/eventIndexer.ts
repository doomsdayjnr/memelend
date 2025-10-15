// eventIndexer.ts
import program from '../services/anchorClient';
import prisma from '../db/client';
import redis from '../db/redis';
import { Connection, PublicKey } from '@solana/web3.js';
import { getCachedSolUsdPrice } from '../routes/price_routes/priceService';


const processedSignatures = new Set<string>();
/** --- Helper Functions --- */

// Shared conversion for short events
function mapShortEventBase(
  event: any
) {
  const base: { txSig: string; mint: string; positionId?: bigint } = {
    txSig: event.txSignature ?? '',
    mint: event.mint.toBase58(),
  };

  if ('positionId' in event && event.positionId !== undefined) {
    base.positionId = BigInt(event.positionId.toString());
  }

  return base;
}

// Standardized broadcast payloads for short positions
function createShortBroadcastPayload(type: string, event: any, extra: any = {}) {
  return { type, ...mapShortEventBase(event), ...extra };
}

async function waitForTxConfirmation(
  connection: Connection,
  signature: string,
  maxRetries = 10,
  delayMs = 2000
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const conf = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });

    const status = conf?.value?.confirmationStatus;
    if (status === "confirmed" || status === "finalized") {
      console.log("Tx is confirmed/finalized:", signature);
      return;
    }

    console.log(
      `Attempt ${attempt + 1}/${maxRetries} → status: ${status ?? "not found"}, retrying in ${delayMs}ms...`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Transaction ${signature} not confirmed after ${maxRetries} retries`);
}

/** --- Event Indexer --- */
export async function startEventIndexer() {
  console.log('🚀 Starting Emitz Event Indexer...');

  // --- Token Launch Event ---
  program.addEventListener('tokenLaunchEvent', async (event: any, slot: number, signature: string) => {
    // console.log('Yield Vault Event received:', event);
    try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);

      await prisma.yieldVault.upsert({
        where: { mint: event.mint.toBase58() },
        update: {
          creator: event.creator.toBase58(),
          aprBps: BigInt(event.aprBps.toString()),
          totalStaked: BigInt(event.deposited.toString()),
          accRewardPerShare: BigInt(event.accRewardPerShare.toString()),
          launchTs: BigInt(event.timestamp.toString()),
          maxWithdrawBps: BigInt(event.maxWithdrawBps.toString()),
          lastAccrualTs: BigInt(event.timestamp.toString()),
          isLive:false,
        },
        create: {
          mint: event.mint.toBase58(),
          creator: event.creator.toBase58(),
          aprBps: BigInt(event.aprBps.toString()),
          totalStaked: BigInt(event.deposited.toString()),
          accRewardPerShare: BigInt(event.accRewardPerShare.toString()),
          launchTs: BigInt(event.timestamp.toString()),
          maxWithdrawBps: BigInt(event.maxWithdrawBps.toString()),
          lastAccrualTs: BigInt(event.timestamp.toString()),
          isLive:false,
        },
      });

      await prisma.userYieldPosition.create({
          data: {
            owner: event.creator.toBase58(),
            mint: event.mint.toBase58(),
            isCreator: event.isCreator,
            isInitialDeposit: true, 
            claimedPrincipal: BigInt(event.claimedPrincipal.toString()),
            initialDeposit: BigInt(event.deposited.toString()),
            deposited: BigInt(event.deposited.toString()),
            rewardDebt: BigInt(event.rewardDebt.toString()),
            claimedTotal: BigInt(event.claimedTotal.toString()),
            depositedAt: BigInt(event.timestamp.toString()),
            lastActionTs: BigInt(event.timestamp.toString()),
          },
        });

        await prisma.yieldPosition.create({
            data: {
              positionId: BigInt(event.positionId.toString()),
              userWallet: event.creator.toBase58(),
              mint: event.mint.toBase58(),
              deposited: BigInt(event.deposited.toString()),
              openedAt:new Date(Number(event.timestamp) * 1000),
              isCreator: event.isCreator,
              isOpen: false,
            },
          });
        
          console.log(`✅ Successfully processed Launch Step One event ${signature}`); 

    } catch (err) {
      console.error('❌ Token Launch Event processing failed', err);
    }
  });

  // --- Presale Token Launch Event ---
  program.addEventListener('presaleEvent', async (event: any, slot: number, signature: string) => {
  
    try {

      const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);

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
      const solIn = BigInt(event.amount.toString());
      const tokensOut = BigInt(event.tokenOut.toString());
      const positionId = BigInt(event.positionId.toString());
      const solReserve = BigInt(event.solReserve.toString());
  
      await prisma.position.create({
        data: {
          positionId,
          userWallet: event.user?.toString() ?? "",
          mint: event.mint?.toString() ?? "",
          side: "buy",
          entryPrice: Number(event.entryPrice.toString()),
          collateral: solIn,
          tokensOut,
          openedAt: blockTime,
          isOpen: true,
          isPresale: true,
          openTxSig: signature,
        },
      });
  

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
          priceSol: Number(solIn) / Number(tokensOut || 1n),
          blockTime,
        },
      });

    
      await prisma.tokenLaunch.update({
        where: {
          mint: event.mint.toBase58(),
        },
        data: {
          presaleAmountLeftOver: event.preSaleTokenAllocation.toString(),
          presaleEntryPrice: Number(event.entryPrice.toString()), 
          presaleSol: solReserve,
        },
      });

      await prisma.yieldVault.update({
          where: { 
            mint: event.mint.toBase58(),
          },
          data: {
            solReserve,
          },
        });

  
    
      console.log(`✅ Successfully processed Presale event ${signature}`); 
      
    } catch (err) {
      console.error('Presale tokens processing failed', err);
    }
  });

  // --- Presale Activation Token Launch Event ---
  program.addEventListener('activatePresaleEvent', async (event: any, slot: number, signature: string) => {
  
    try {

      const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);

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
      const tokenReserve = BigInt(event.tokenReserve.toString());
      const solReserve = BigInt(event.solReserve.toString());
      const accumulatedC = BigInt(event.accumulatedC?.toString() ?? "0");
      const virtualSol = BigInt(event.virtualSol.toString());
      const virtualTokens = BigInt(event.virtualTokens.toString());
      const totalStaked = BigInt(event.totalStaked.toString());
      const initialDeposit = BigInt(event.initialDeposit.toString());
      const deposited = BigInt(event.deposited.toString());
      const mint = event.mint.toBase58();
      const owner = event.owner.toBase58();

      const WSOL_DECIMALS = 9;
      const TOKEN_DECIMALS = 6;

      // --- Current price ---
      const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
      const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;
      const priceLamports = solNormalized / tokenNormalized;

      // Update DB to mark presale as complete and active
      await prisma.tokenLaunch.update({
        where: { mint },
        data: {
          isPresale: false,
          status: 'active',
          createdAt:new Date(blockTime),
        },
      });

      // 🪣 Push first tick to Redis stream
        await redis.xadd(
          "ticks",
          "*",
          "mint", mint,
          "price", String(priceLamports),
          "qtyQuote", String(solReserve),
          "ts", String(blockTime),
          "side", "liquidity"
        );

        await prisma.yieldVault.update({
          where: { 
            mint: event.mint.toBase58(),
          },
          data: {
            totalStaked,
          },
        });

        // 🔄 Update userYieldPosition
        await prisma.userYieldPosition.update({
          where: { owner_mint: { owner, mint } },
          data: {
            initialDeposit,
            deposited,
          },
        });

        await prisma.yieldPosition.updateMany({
          where: { 
            userWallet:owner,
            mint:mint,
           },
          data: {
            deposited,
            isOpen: true,
          },
        });
    
      console.log(`✅ Successfully processed Presale event ${signature}`); 
      
    } catch (err) {
      console.error('Presale tokens processing failed', err);
    }
  });

  // --- Presale Fees Rewards Token Launch Event ---
  program.addEventListener('claimPresaleFeesRewardsEvent', async (event: any, slot: number, signature: string) => {
  
    try {

      const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);

      // --- Deduplication (skip if trade already exists) ---
      const existingTrade = await prisma.trade.findUnique({
        where: { txSig: signature },
      });
      if (existingTrade) {
        console.log(`⚠️ Trade ${signature} already processed, skipping.`);
        return;
      }

      // --- Update UserYieldPosition ---
      await prisma.position.updateMany({
        where: { userWallet: event.owner.toString(), mint: event.mint.toString() },
        data: {
          feeDebt: BigInt(event.feeDebt.toString()),
          claimedTotal: BigInt(event.totalClaimed.toString()),
          lastActionTs: BigInt(event.timestamp.toString()),
        },
      });

      // --- Log Reward Claim ---
      await prisma.rewardClaim.create({
        data: {
          owner: event.owner.toString(),
          mint: event.mint.toString(),
          claimedAmount: BigInt(event.claimedAmount.toString()),
          newRewardDebt: BigInt(event.feeDebt.toString()),
          totalClaimed: BigInt(event.totalClaimed.toString()),
          lastAccrualTs: BigInt(event.lastAccrualTs.toString()),
          timestamp: BigInt(event.timestamp.toString()),
        },
      });
    
      console.log(`✅ Successfully processed Presale claimed reward event ${signature}`); 
      
    } catch (err) {
      console.error('Presale tokens processing failed', err);
    }
  });

  // --- Token Confirmed Launch Event ---
  program.addEventListener('tokenConfirmedLaunchEvent', async (event: any, slot: number, signature: string) => {
    // console.log('Liquidity Added Event Event received:', event);
    try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);

        await prisma.yieldVault.updateMany({
            where: { 
              creator:event.creator.toBase58(),
              mint: event.mint.toBase58(),
            },
            data: {
              tokenReserve: BigInt(event.tokenReserve.toString()),
              virtualSol: BigInt(event.virtualSol.toString()),
              virtualTokens: BigInt(event.virtualTokens.toString()),
              isLive:true,
            },
          });


        console.log(`✅ Successfully processed Launch Step Two event ${signature}`); 

    } catch (err) {
      console.error('❌ Token Confirmed Launch Event processing failed', err);
    }
  });

  // --- vaultInitEvent ---
  program.addEventListener('liquidityAdded', async (event: any, slot: number, signature: string) => {
  
    try {

      const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);
      
      const ts = Date.now();
      const qtyQuote = Number(BigInt(event.liqAdded.toString())) / 1e9;          // SOL in
      const tokenReserve = BigInt(event.tokenReserve.toString());
      const solReserve = BigInt(event.solReserve.toString());
      const virtualSol = BigInt(event.virtualSol.toString());
      const virtualTokens = BigInt(event.virtualTokens.toString());
      const accumulatedC = BigInt(event.accumulatedC?.toString() ?? "0");
      // --- Current price ---
      const WSOL_DECIMALS = 9;
      const TOKEN_DECIMALS = 6;

      // Convert to floats
      const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
      const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

      const priceLamports = solNormalized / tokenNormalized;

      await prisma.yieldVault.updateMany({
          where: { 
            creator:event.creator.toBase58(),
            mint: event.mint.toBase58(),
           },
          data: {
            liquidityAdded: { increment: BigInt(event.liqAdded.toString()) },
            tokenReserve,
            solReserve,
            lastLiquidityAdded: new Date(ts),
          },
        });

        await prisma.yieldPosition.updateMany({
          where: { 
            userWallet:event.creator.toBase58(),
            mint: event.mint.toBase58(),
           },
          data: {
            isOpen: true,
          },
        });

        await redis.xadd(
          'ticks',
          '*',
          'mint', event.mint.toBase58(),
          'price', String(priceLamports),
          'qtyQuote', String(qtyQuote),
          'ts', String(ts),
          'side', 'liquidity'
        );
      
    } catch (err) {
      console.error('❌ Liquidity Added processing failed', err);
    }
  });

  // --- Deposit Event ---
  program.addEventListener("depositYieldEvent", async (event: any, slot: number, signature: string) => {
    // console.log("Event", event);
    try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);
            
        await prisma.position.updateMany({
          where: { 
            positionId: BigInt(event.positionId.toString()),
            mint: event.mint.toBase58(),
           },
          data: {
            isOpen: false,
          },
        });

        await prisma.yieldPosition.upsert({
          where: {
              positionId: BigInt(event.positionId.toString()),
              mint: event.mint.toBase58(),
          },
          update: {
            deposited: BigInt(event.amount.toString()), // or { increment: BigInt(...) } if additive
            openedAt: new Date(Number(event.depositedAt) * 1000),
            isOpen: true,
          },
          create: {
            positionId: BigInt(event.positionId.toString()),
            userWallet: event.owner.toBase58(),
            mint: event.mint.toBase58(),
            deposited: BigInt(event.amount.toString()),
            openedAt: new Date(Number(event.depositedAt) * 1000),
            isCreator: event.isCreator,
            isOpen: true,
          },
        });

        const existing = await prisma.userYieldPosition.findFirst({
          where: {owner: event.owner.toString(), mint: event.mint.toString(),},
        });


      if (existing) {
        // --- Update UserYieldPosition ---
        await prisma.userYieldPosition.updateMany({
          where: { owner: event.owner.toString(), mint: event.mint.toString() },
          data: {
            deposited: BigInt(event.deposited.toString()),
            claimedTotal: BigInt(event.claimedTotal.toString()),
            rewardDebt: BigInt(event.rewardDebt.toString()),
            lastActionTs: BigInt(event.lastActionTs.toString()),
          },
        });
        
      } else {
        // Insert new position
        await prisma.userYieldPosition.create({
          data: {
            owner: event.owner.toBase58(),
            mint: event.mint.toBase58(),
            isCreator: event.isCreator,
            claimedPrincipal: BigInt(0),
            deposited: BigInt(event.deposited.toString()),
            rewardDebt: BigInt(event.rewardDebt.toString()),
            claimedTotal: BigInt(event.claimedTotal.toString()),
            depositedAt: BigInt(event.depositedAt.toString()),
            lastActionTs: BigInt(event.lastActionTs.toString()),
          },
        });

      }

      // --- Update yield_vault ---
      await prisma.yieldVault.updateMany({
        where: { mint: event.mint.toString() },
        data: {
            totalStaked: BigInt(event.totalStaked.toString()),
            lastAccrualTs: BigInt(event.lastAccrualTs.toString()),
          },
      });

      console.log(
        `Updated yield vault ${event.mint.toString()} and user position for ${event.owner.toString()}`
      );
    } catch (err) {
        console.error("Error handling DepositYieldEvent:", err);
    }
  });

    // --- Withdrawal User Event ---
  program.addEventListener("withdrawYieldEvent", async (event: any, slot: number, signature: string) => {

      try{

          const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

          // 🛑 Skip placeholder sig
          if (signature === PLACEHOLDER_SIG) {
            console.warn("⚠️ Skipping confirmation — placeholder signature");
            return;
          }

          // ✅ Deduplicate: skip if we already processed this sig
          if (processedSignatures.has(signature)) {
            console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
            return;
          }
          processedSignatures.add(signature);

          // Optional: clean up old sigs to avoid memory bloat
          if (processedSignatures.size > 5000) {
            // keep last 5000 sigs max
            const firstKey = processedSignatures.values().next().value as string | undefined;
            if (firstKey) {
              processedSignatures.delete(firstKey);
            }
          }

          const alreadyProcessed = await prisma.processedTx.findUnique({
            where: { signature },
          });

          if (alreadyProcessed) {
            console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
            return;
          }

          // Mark as processed immediately
          await prisma.processedTx.create({
            data: { signature },
          });

          await waitForTxConfirmation(program.provider.connection, signature);

          await prisma.position.updateMany({
            where: { 
              positionId: BigInt(event.positionId.toString()),
              mint: event.mint.toBase58(),
            },
            data: {
              isOpen: true,
            },
          });
          await prisma.yieldPosition.updateMany({
            where: { 
              positionId: BigInt(event.positionId.toString()),
              mint: event.mint.toBase58(),
            },
            data: {
              isOpen: false,
            },
          });

           if(Number(event.claimedAmount) > 0){
              // --- Log Reward Claim ---
                await prisma.rewardClaim.create({
                  data: {
                    owner: event.owner.toString(),
                    mint: event.mint.toString(),
                    claimedAmount: BigInt(event.claimedAmount.toString()),
                    newRewardDebt: BigInt(event.rewardDebt.toString()),
                    totalClaimed: BigInt(event.claimedTotal.toString()),
                    lastAccrualTs: BigInt(event.lastActionTs.toString()),
                    timestamp: BigInt(event.lastActionTs.toString()),
                  },
                });
           }
        
          // --- Update UserYieldPosition ---
          await prisma.userYieldPosition.updateMany({
            where: { owner: event.owner.toString(), mint: event.mint.toString() },
            data: {
              claimedPrincipal: BigInt(event.claimedPrincipal.toString()),
              deposited: BigInt(event.remainingDeposited.toString()),
              claimedTotal: BigInt(event.claimedTotal.toString()),
              rewardDebt: BigInt(event.rewardDebt.toString()),
              lastActionTs: BigInt(event.lastActionTs.toString()),
            },
          });

        // --- Update yield_vault ---
        await prisma.yieldVault.updateMany({
          where: { mint: event.mint.toString() },
          data: {
              totalStaked: BigInt(event.totalStaked.toString()),
              lastAccrualTs: BigInt(event.lastActionTs.toString()),
            },
        });

        console.log(
          `Updated yield vault ${event.mint.toString()} and user position for ${event.owner.toString()}`
        );

      }catch (err) {
        console.error("Error handling withdrawYieldEvent:", err);
      }
  });

  // --- Withdrawal Creator Event ---
  program.addEventListener("creatorYieldWithdrawalEvent", async (event: any, slot: number, signature: string) => {
    // console.log("Creator withdrawal Yield event", event);

    try {

      const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);

      const positionId = BigInt(event.positionId.toString());
      const mint = event.mint.toString();
      const owner = event.owner.toString();
      const remainingDeposit = BigInt(event.remainingDeposit.toString());
      const amountWithdraw = BigInt(event.amountWithdraw.toString());


      // 🔍 Check if position exists
      const existingPos = await prisma.position.findFirst({
        where: {
          positionId,
          mint,
          userWallet: owner,
        },
      });

      if (!existingPos) {
        // ➡️ No position exists, create new
        await prisma.position.create({
          data: {
            positionId: positionId,
            userWallet: owner,
            mint,
            side: "buy",
            entryPrice: Number(0),
            tokensOut: amountWithdraw,
            openedAt: new Date(Number(event.ts.toString()) * 1000),
            isOpen: true,
            openTxSig:signature,
          },
        });
      } else {
        if(event.isInitialDeposit){

          await prisma.position.update({
            where: { id: existingPos.id },
            data: {
              tokensOut: { increment:amountWithdraw},  
              isOpen: true,
              openTxSig:signature,
            },
          });

        }else{

          await prisma.position.update({
            where: { id: existingPos.id },
            data: {
              tokensOut: amountWithdraw,
              isOpen: true,
              openTxSig:signature,
            },
          });

        }
      }

      if(event.isInitialDeposit){

          // 🔄 Update userYieldPosition
          await prisma.userYieldPosition.update({
            where: { owner_mint: { owner, mint } },
            data: {
              claimedPrincipal: BigInt(event.claimedPrincipal.toString()),
              initialDeposit:{decrement: amountWithdraw},
              deposited: remainingDeposit,
              claimedTotal: BigInt(event.claimedTotal.toString()),
              rewardDebt: BigInt(event.rewardDebt.toString()),
              lastActionTs: BigInt(event.ts.toString()),
            },
          });

          await prisma.yieldPosition.update({
            where: { positionId, mint },
            data: {
              deposited: {decrement: amountWithdraw},
            },
          });

        }else{

          // 🔄 Update userYieldPosition
          await prisma.userYieldPosition.update({
            where: { owner_mint: { owner, mint } },
            data: {
              claimedPrincipal: BigInt(event.claimedPrincipal.toString()),
              deposited: remainingDeposit,
              claimedTotal: BigInt(event.claimedTotal.toString()),
              rewardDebt: BigInt(event.rewardDebt.toString()),
              lastActionTs: BigInt(event.ts.toString()),
            },
          });

          await prisma.yieldPosition.update({
            where: { positionId, mint },
            data: {
              deposited: amountWithdraw,
            },
          });

        }


      // 🏆 Log reward claim if any
      if (Number(event.claimedRewards) > 0) {
        await prisma.rewardClaim.create({
          data: {
            owner,
            mint,
            claimedAmount: BigInt(event.claimedRewards.toString()),
            newRewardDebt: BigInt(event.rewardDebt.toString()),
            totalClaimed: BigInt(event.claimedTotal.toString()),
            lastAccrualTs: BigInt(event.ts.toString()),
            timestamp: BigInt(event.ts.toString()),
          },
        });
      }
      
      // 🔄 Update yieldVault
      await prisma.yieldVault.updateMany({
        where: { mint },
        data: {
          totalStaked: BigInt(event.totalStaked.toString()),
          lastAccrualTs: BigInt(event.ts.toString()),
        },
      });

      if(event.isInitialDeposit){

        //This section set isOpen to false if deposit is 0
        const userYield = await prisma.yieldPosition.findFirst({
          where: { positionId, mint },
        });

        const shouldClose = !userYield || userYield.deposited === BigInt(0);

        await prisma.yieldPosition.update({
          where: { positionId, mint },
          data: {
            isOpen: !shouldClose, // stays true if deposit > 0
          },
        });

      }else{
        
        await prisma.yieldPosition.update({
          where: { positionId, mint },
          data: {
            isOpen: false, 
          },
        });
      }
      

      console.log(
        `✅ Updated yield vault ${mint} and user position for ${owner}`
      );
    } catch (err) {
      console.error("❌ Error handling creatorYieldWithdrawalEvent:", err);
    }
  });


  // --- Claim Event ---
  program.addEventListener('claimRewardsEvent', async (event: any, slot: number, signature: string) => {
   
    try { 

        if (
            signature === "1111111111111111111111111111111111111111111111111111111111111111"
        ) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
        } else {
          await waitForTxConfirmation(program.provider.connection, signature);
        }

      // --- Update UserYieldPosition ---
      await prisma.userYieldPosition.updateMany({
        where: { owner: event.owner.toString(), mint: event.mint.toString() },
        data: {
          claimedTotal: BigInt(event.totalClaimed.toString()),
          rewardDebt: BigInt(event.newRewardDebt.toString()),
          lastActionTs: BigInt(event.timestamp.toString()),
        },
      });

      // --- Update YieldVault ---
      await prisma.yieldVault.updateMany({
        where: { mint: event.mint.toString() },
        data: {
          lastAccrualTs: BigInt(event.lastAccrualTs.toString()),
        },
      });

      // --- Log Reward Claim ---
      await prisma.rewardClaim.create({
        data: {
          owner: event.owner.toString(),
          mint: event.mint.toString(),
          claimedAmount: BigInt(event.claimedAmount.toString()),
          newRewardDebt: BigInt(event.newRewardDebt.toString()),
          totalClaimed: BigInt(event.totalClaimed.toString()),
          lastAccrualTs: BigInt(event.lastAccrualTs.toString()),
          timestamp: BigInt(event.timestamp.toString()),
        },
      });

      console.log(`✅ ClaimRewardsEvent processed for ${event.owner.toString()} on mint ${event.mint.toString()}`);
    } catch (err) {
      console.error("Error handling ClaimRewardsEvent:", err);
    }
  });

   // --- Claim Event ---
  program.addEventListener('claimReferralRewardEvent', async (event: any, slot: number, signature: string) => {
   
    try { 

        if (
            signature === "1111111111111111111111111111111111111111111111111111111111111111"
        ) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
        } else {
          await waitForTxConfirmation(program.provider.connection, signature);
        }
        const pendingRewards = BigInt(event.pendingRewards.toString());
        await prisma.user.update({
            where: { wallet: event.owner.toString() },
            data: {
              pendingRewards: pendingRewards,
            },
          });

      console.log(`✅ Claim Referral Reward Event processed for ${event.owner.toString()}`);
    } catch (err) {
      console.error("Error handling ClaimReferralRewardEvent:", err);
    }
  });

  // --- Creator Claim Earnings Event ---
  program.addEventListener('claimEarningsEvent', async (event: any, slot: number, signature: string) => {
    // console.log("Creator claimed Event received:", event);
    try { 

        if (
            signature === "1111111111111111111111111111111111111111111111111111111111111111"
        ) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
        } else {
          await waitForTxConfirmation(program.provider.connection, signature);
        }

        // --- Update YieldVault ---
      await prisma.yieldVault.updateMany({
        where: { mint: event.mint.toString() },
        data: {
          creatorVault: BigInt(event.creatorVault.toString()),
        },
      });

      // --- Log Reward Claim ---
      await prisma.creatorEarningsWithdrawal.create({
        data: {
          mint: event.mint.toString(),
          creator: event.owner.toString(),
          totalEarned: BigInt(event.totalEarned.toString()),
          amountWithdrew: BigInt(event.amountWithdrew.toString()),
          txSig:signature,
          updatedAt: new Date(Number(event.timestamp.toString()) * 1000),
        },
      });

      console.log(`✅ Creator Claim Earnings Event processed for ${event.owner.toString()} on mint ${event.mint.toString()}`);
    } catch (err) {
      console.error("Error handling Creator Claim Earnings:", err);
    }
  });

  // --- BUY EVENT ---
  program.addEventListener(
    'buyEvent',
    async (event: any, slot: number, signature: string) => {

      try {
         const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);

        const mint = event.mint.toString();
        const user = event.user.toString();
        const entryPrice = Number(event.entryPrice.toString());
        const solIn = BigInt(event.solIn.toString());
        const tokensOut = BigInt(event.tokensOut.toString());
        let blockTime: Date | null = null;
        if (event.timestamp) {
          const tsNumber = Number(event.timestamp);
          if (!isNaN(tsNumber)) {
            blockTime = new Date(tsNumber * 1000);
          }
        }
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
        const vaultBump = event.vaultBump;

        await prisma.rawEvent.create({
          data: {
            sig: signature,
            type: "buy",
            data: {
              user:user.toString(),
              mint:mint.toString(),
              positionId: positionId.toString(),
              entryPrice:entryPrice.toString(),
              solIn: solIn.toString(), // store as string for safety
              tokensOut: tokensOut.toString(),
              blockTime: blockTime?.toISOString() ?? null,
              pendingRewards: pendingRewards.toString(),
              totalEarned: totalEarned.toString(),
              totalFeesEarnings: totalFeesEarnings.toString(),
              creatorVault: creatorVault.toString(),
              referralShareSol: referralShareSol.toString(),
              platformVault: platformVault.toString(),
              tokenReserve: tokenReserve.toString(),
              solReserve: solReserve.toString(),
              accumulatedC: accumulatedC.toString(),
              virtualSol: virtualSol.toString(),
              virtualTokens: virtualTokens.toString(),
              accRewardPerShare:accRewardPerShare.toString(),
              preSaleAccFeePerShare:preSaleAccFeePerShare.toString(),
              interest: interest.toString(),
              preSaleFeeSol: preSaleFeeSol.toString(),
              vaultBump:vaultBump,
            },
          },
        });

        console.log(`📥 Ingested raw buy event ${signature}`);
      } catch (err) {
        console.log(`📥 Ingested raw buy event error ${signature}`);
      }
    }
  );

  // --- SELL EVENT ---
  program.addEventListener(
    'sellEvent',
    async (event: any, slot: number, signature: string) => {

      try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

      // 🛑 Skip placeholder sig
      if (signature === PLACEHOLDER_SIG) {
        console.warn("⚠️ Skipping confirmation — placeholder signature");
        return;
      }

      // ✅ Deduplicate: skip if we already processed this sig
      if (processedSignatures.has(signature)) {
        console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
        return;
      }
      processedSignatures.add(signature);

      // Optional: clean up old sigs to avoid memory bloat
      if (processedSignatures.size > 5000) {
        // keep last 5000 sigs max
        const firstKey = processedSignatures.values().next().value as string | undefined;
        if (firstKey) {
          processedSignatures.delete(firstKey);
        }
      }

      const alreadyProcessed = await prisma.processedTx.findUnique({
        where: { signature },
      });

      if (alreadyProcessed) {
        console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
        return;
      }

      // Mark as processed immediately
      await prisma.processedTx.create({
        data: { signature },
      });

      await waitForTxConfirmation(program.provider.connection, signature);

      const mint = event.mint.toString();
      const user = event.user.toString();
      const positionId = BigInt(event.positionId.toString());
      const solOut = BigInt(event.solOut.toString());
      const tokensIn = BigInt(event.tokensIn.toString());
      const blockTime = new Date(Number(event.timestamp.toString()) * 1000);
      const pendingRewards = BigInt(event.pendingRewards.toString());
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

        await prisma.rawEvent.create({
          data: {
            sig: signature,
            type: "sell",
            data: {
              mint:mint.toString(),
              user:user.toString(),
              exitPrice:exitPrice.toString(),
              solOut: solOut.toString(), 
              tokensIn: tokensIn.toString(),
              blockTime: blockTime?.toISOString() ?? null,
              positionId: positionId.toString(),
              pendingRewards: pendingRewards.toString(),
              totalEarned: totalEarned.toString(),
              creatorVault: creatorVault.toString(),
              referralShareSol: referralShareSol.toString(),
              totalFeesEarnings: totalFeesEarnings.toString(),
              platformVault: platformVault.toString(),
              tokenReserve: tokenReserve.toString(),
              solReserve: solReserve.toString(),
              accumulatedC: accumulatedC.toString(),
              virtualSol: virtualSol.toString(),
              virtualTokens: virtualTokens.toString(),
              accRewardPerShare:accRewardPerShare.toString(),
              preSaleAccFeePerShare:preSaleAccFeePerShare.toString(),
              interest: interest.toString(),
              preSaleFeeSol: preSaleFeeSol.toString(),
            },
          },
        });

      console.log(`📥 Ingested raw sell event ${signature}`);

      } catch (err) {
        console.error('❌ sell Event processing failed', err);
      }
    }
  );

  // --- SHORT EVENT ---
    program.addEventListener(
    'shortEvent',
    async (event: any, slot: number, signature: string) => {
      try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);

        const blockTime = event.timestamp
        ? new Date(Number(event.timestamp) * 1000)
        : new Date();
        const mint = event.mint.toString();
        const user = event.user.toString();
        const collateralAmt = BigInt(event.collateral.toString());
        const borrowedAmt = BigInt(event.borrowedTokens.toString());
        const openPrice = Number(event.entryPrice.toString());
        const positionId = BigInt(event.positionId.toString());
        const liquidationPrice = Number(event.liquidationPrice.toString());
        const openedAt = new Date(Number(event.timestamp.toString()) * 1000);
        const creatorVault = BigInt(event.creatorVault.toString());
        const platformVault = BigInt(event.platformVault.toString());
        const pendingRewards = BigInt(event.pendingRewards.toString());
        const totalEarned = BigInt(event.totalEarned.toString());
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
        
        await prisma.rawEvent.create({
          data: {
            sig: signature,
            type: "short",
            data: {
              mint:mint.toString(),
              user:user.toString(),
              openPrice:openPrice.toString(),
              collateralAmt: collateralAmt.toString(), // store as string for safety
              borrowedAmt: borrowedAmt.toString(),
              blockTime: blockTime?.toISOString() ?? null,
              positionId: positionId.toString(),
              liquidationPrice:liquidationPrice.toString(),
              pendingRewards: pendingRewards.toString(),
              totalEarned: totalEarned.toString(),
              creatorVault: creatorVault.toString(),
              referralShareSol: referralShareSol.toString(),
              totalFeesEarnings: totalFeesEarnings.toString(),
              platformVault: platformVault.toString(),
              tokenReserve: tokenReserve.toString(),
              solReserve: solReserve.toString(),
              accumulatedC: accumulatedC.toString(),
              virtualSol: virtualSol.toString(),
              virtualTokens: virtualTokens.toString(),
              accRewardPerShare:accRewardPerShare.toString(),
              preSaleAccFeePerShare:preSaleAccFeePerShare.toString(),
              interest: interest.toString(),
              preSaleFeeSol: preSaleFeeSol.toString(),
            },
          },
        });

      } catch (err) {
        console.error('❌ ShortEvent processing failed', err);
      }
    }
  );


  // --- CLOSE SHORT EVENT ---
  program.addEventListener('closePositionEvent', async (event: any, slot: number, signature: string) => {

    try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);


        const blockTime = event.timestamp
        ? new Date(Number(event.timestamp) * 1000)
        : new Date();
        const mint = event.mint.toString();
        const user = event.user.toString();
        const positionId = BigInt(event.positionId.toString());
        const collateralReturned = BigInt(event.collateralReturned.toString());
        const exitPrice = Number(event.exitPrice.toString());
        const repaidTokens = BigInt(event.repaidTokens.toString());
        const pendingRewards = BigInt(event.pendingRewards.toString());
        const totalEarned = BigInt(event.totalEarned.toString());
        const totalFees = BigInt(event.totalFees.toString());
        const totalFeesEarnings = BigInt(event.totalFeesEarnings.toString());
        const interest = BigInt(event.interest.toString());
        const platformVault = BigInt(event.platformVault.toString());
        const creatorVault = BigInt(event.creatorVault.toString());
        const referralShareSol = BigInt(event.referralShareSol.toString());
        const solReserve = BigInt(event.solReserve.toString());
        const tokenReserve =  BigInt(event.tokenReserve.toString());
        const accumulatedCAfter = BigInt(event.accumulatedCAfter.toString());
        const accRewardPerShare = BigInt(event.accRewardPerShare.toString());
        const pnl = BigInt(event.pnl.toString());
        const virtualSol = BigInt(event.virtualSol.toString());
        const virtualTokens = BigInt(event.virtualTokens.toString());
        const preSaleAccFeePerShare = BigInt(event.preSaleAccFeePerShare.toString());
        const preSaleFeeSol = BigInt(event.preSaleFeeSol.toString());
        
        await prisma.rawEvent.create({
          data: {
            sig: signature,
            type: "close",
            data: {
              mint:mint.toString(),
              user:user.toString(),
              exitPrice:exitPrice.toString(),
              collateralReturned: collateralReturned.toString(), // store as string for safety
              repaidTokens: repaidTokens.toString(),
              pnl:pnl.toString(),
              blockTime: blockTime?.toISOString() ?? null,
              positionId: positionId.toString(),
              pendingRewards: pendingRewards.toString(),
              totalEarned: totalEarned.toString(),
              totalFees:totalFees.toString(),
              interest: interest.toString(),
              creatorVault: creatorVault.toString(),
              referralShareSol: referralShareSol.toString(),
              totalFeesEarnings: totalFeesEarnings.toString(),
              platformVault: platformVault.toString(),
              tokenReserve: tokenReserve.toString(),
              solReserve: solReserve.toString(),
              accumulatedCAfter: accumulatedCAfter.toString(),
              accRewardPerShare:accRewardPerShare.toString(),
              virtualSol: virtualSol.toString(),
              virtualTokens: virtualTokens.toString(),
              preSaleAccFeePerShare:preSaleAccFeePerShare.toString(),
              preSaleFeeSol: preSaleFeeSol.toString(),
            },
          },
        });
   
    } catch (err) {
      console.error('❌ ClosePositionEvent processing failed', err);
    }
  });

  // --- LIQUIDATE POSITION EVENT ---
  program.addEventListener('liquidatePositionEvent', async (event: any, slot: number, signature: string) => {

    console.log(`liquidate event:`, event);
    
    try {

        const PLACEHOLDER_SIG = "1111111111111111111111111111111111111111111111111111111111111111";

        // 🛑 Skip placeholder sig
        if (signature === PLACEHOLDER_SIG) {
          console.warn("⚠️ Skipping confirmation — placeholder signature");
          return;
        }

        // ✅ Deduplicate: skip if we already processed this sig
        if (processedSignatures.has(signature)) {
          console.warn(`⚠️ Skipping duplicate event for signature ${signature}`);
          return;
        }
        processedSignatures.add(signature);

        // Optional: clean up old sigs to avoid memory bloat
        if (processedSignatures.size > 5000) {
          // keep last 5000 sigs max
          const firstKey = processedSignatures.values().next().value as string | undefined;
          if (firstKey) {
            processedSignatures.delete(firstKey);
          }
        }

        const alreadyProcessed = await prisma.processedTx.findUnique({
          where: { signature },
        });

        if (alreadyProcessed) {
          console.warn(`⚠️ Duplicate event skipped for sig ${signature}`);
          return;
        }

        // Mark as processed immediately
        await prisma.processedTx.create({
          data: { signature },
        });

        await waitForTxConfirmation(program.provider.connection, signature);

        const solReserve = BigInt(event.solReserve.toString());
        const tokenReserve =  BigInt(event.tokenReserveAfter.toString());
        const accumulatedC = BigInt(event.accumulatedCAfter.toString());
        const virtualSol = BigInt(event.virtualSol.toString());
        const virtualTokens = BigInt(event.virtualTokens.toString());
        const interest = BigInt(event.interest.toString());
        // --- Current price ---
        const WSOL_DECIMALS = 9;
        const TOKEN_DECIMALS = 6;

        // Convert to floats
        const solNormalized = Number(solReserve + accumulatedC + virtualSol) / 10 ** WSOL_DECIMALS;
        const tokenNormalized = Number(tokenReserve + virtualTokens) / 10 ** TOKEN_DECIMALS;

        const priceLamports = solNormalized / tokenNormalized;
        const qtyQuote = Number(BigInt(event.forfeitedCollateral.toString())) / 1e9;    
        

      // --- Derive closedAt ---
      let closedAt: Date = new Date(); // fallback
      if (event.timestamp !== undefined && event.timestamp !== null) {
        if (typeof event.timestamp === 'number') {
          closedAt = new Date(event.timestamp * 1000);
        } else if (typeof event.timestamp === 'object' && 'toNumber' in event.timestamp) {
          closedAt = new Date(event.timestamp.toNumber() * 1000);
        }
      }

      const tsMs = closedAt.getTime();

      // --- Update YieldVault ---
      await prisma.yieldVault.updateMany({
        where: { mint: event.mint.toString() },
        data: {
          accRewardPerShare: BigInt(event.accRewardPerShare.toString()),
          interestVault: interest,
          tokenReserve: tokenReserve,
          accumulatedC: accumulatedC,
        },
      });

      await prisma.position.updateMany({
          where: { 
            positionId: BigInt(event.positionId.toString()),
            mint: event.mint.toBase58(),
           },
          data: {
            pnl: BigInt(event.forfeitedCollateral.toString()),
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
        if (signature !== PLACEHOLDER_SIG) {
          await prisma.vaultSnapshot.create({
            data: {
              mint: event.mint.toString(),
              blockTime: new Date(),
              txSig: signature,
              reason: "liquidate",
              solReserve,
              tokenReserve,
              accumulatedC,
              virtualSol,
              virtualTokens,
              priceLamports,
              volumeSolDelta,
            },
          });
          
        }

        await redis.xadd(
          'ticks',
          '*',
          'mint', event.mint.toBase58(),
          'price', String(priceLamports),
          'qtyQuote', String(qtyQuote),
          'ts', String(tsMs),
          'side', 'liquidate'
        );

      // --- Update DB ---
      await prisma.shortPosition.updateMany({
        where: {
          positionId: BigInt(event.positionId.toString()),
          mint: event.mint.toBase58(),
        },
        data: {
          isClosed: true, // 🔑 ensure position is marked closed
          isLiquidated: true,
          closedAt,

          // core amounts
          collateralAmt: BigInt(event.forfeitedCollateral.toString()),
          borrowedAmt: BigInt(event.repaidTokens.toString()),

          // liquidation-specific values
          repaidTokens: BigInt(event.repaidTokens.toString()),
          exitPrice: Number(event.exitPrice.toString()),
          interest: BigInt(event.interest.toString()),
          totalFees: BigInt(event.totalFees.toString()),
          forfeitedCollateral: BigInt(event.forfeitedCollateral.toString()),
          accumulatedCAfter: BigInt(event.accumulatedCAfter.toString()),
          tokenReserveAfter: BigInt(event.tokenReserveAfter.toString()),
          closeTxSig:signature,
        },
      });

     
    } catch (err) {
      console.error('❌ LiquidatePositionEvent processing failed', err);
    }
  });


  console.log('✅ Event Indexer running!');
}

if (require.main === module) {
  startEventIndexer().catch(err => {
    console.error('❌ Failed to start Event Indexer:', err);
  });
}
