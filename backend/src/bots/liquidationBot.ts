// /bots/liquidationBot.ts
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import program from '../services/anchorClient';
import fs from 'fs';
import { Keypair } from '@solana/web3.js';
import { fetchOpenPositions } from '../utils/allPositions'; 
import { fetchCurrentPrice } from '../services/pricing';
import {getCachedSolUsdPrice} from '../routes/price_routes/priceService';

export const BOT_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf-8')))
);

const SAFETY_MARGIN = 1.02; // 2% buffer to avoid borderline cases

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function ensureAtaExists(program: anchor.Program, mint: PublicKey, owner: PublicKey): Promise<{
  ata: PublicKey;
  preInstruction?: anchor.web3.TransactionInstruction;
}> {
  const ata = await anchor.utils.token.associatedAddress({ mint, owner });
  try {
    await getAccount(program.provider.connection, ata);
    return { ata };
  } catch {
    const ix = createAssociatedTokenAccountInstruction(
      BOT_KEYPAIR.publicKey,
      ata,
      owner,
      mint
    );
    return { ata, preInstruction: ix };
  }

  
}

async function buildPdas(mintKey: PublicKey, userPubkey: PublicKey, positionIdBn: anchor.BN,) {
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), mintKey.toBuffer()],
    program.programId
  );
  const [wsolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_wsol'), mintKey.toBuffer()],
    program.programId
  );
  const [wsolVaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_wsol_authority'), mintKey.toBuffer()],
    program.programId
  );
  const [tokenLiquidityVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
    program.programId
  );
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config'), mintKey.toBuffer()],
    program.programId
  );
  const [tokenConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('config'), mintKey.toBuffer()],
    program.programId
  );
  const [lendingVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_lending'), mintKey.toBuffer()],
    program.programId
  );
  const [projectVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_project'), mintKey.toBuffer()],
    program.programId
  );
  const [liquidityVaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_liquidity_authority'), mintKey.toBuffer()],
    program.programId
  );

  const [yieldVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('yield_vault'), mintKey.toBuffer()],
      program.programId
  );
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), userPubkey.toBuffer(), mintKey.toBuffer(),
    new anchor.BN(positionIdBn).toArrayLike(Buffer, 'le', 8),], 
    program.programId
  );

  return {
    vaultAuthority,
    wsolVault,
    wsolVaultAuthority,
    tokenLiquidityVault,
    vaultConfig,
    tokenConfig,
    yieldVault,
    lendingVault,
    projectVault,
    liquidityVaultAuthority,
    positionPDA,
  };
}

async function liquidatePositionOnChain(
  userPubkey: PublicKey,
  positionIdBn: anchor.BN,
  mintKey: PublicKey
) {
  const {
    vaultAuthority,
    wsolVault,
    tokenLiquidityVault,
    vaultConfig,
    tokenConfig,
    lendingVault,
    yieldVault,
    projectVault,
    liquidityVaultAuthority,
    wsolVaultAuthority,
    positionPDA,
  } = await buildPdas(mintKey, userPubkey, positionIdBn);

  const wsolMint = new PublicKey(process.env.WSOL_MINT!);
  const { ata: botWsolAta, preInstruction } = await ensureAtaExists(
    program,
    wsolMint,
    BOT_KEYPAIR.publicKey
  );

  const ix = await program.methods
    .liquidatePosition({ positionId: positionIdBn })
    .accounts({
      bot: BOT_KEYPAIR.publicKey,
      user: userPubkey,
      wsolMint,
      mint: mintKey,
      position: positionPDA,
      tokenConfig,
      vaultConfig,
      vaultAuthority,
      tokenLiquidityVault,
      lendingVault,
      yieldVault,
      wsolVault,
      projectVault,
      botWsolAccount: botWsolAta,
      liquidityVaultAuthority,
      wsolVaultAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();



  const tx = new Transaction();
  if (preInstruction) tx.add(preInstruction);
  tx.add(ix);
  tx.feePayer = BOT_KEYPAIR.publicKey;

  return await sendAndConfirmTransaction(program.provider.connection, tx, [BOT_KEYPAIR], {
    commitment: 'confirmed',
  });
}

export async function startOnChainLiquidationBot() {
  console.log('🤖 DB-based liquidation bot started...');

  const APR = 0.10; // 10% annual interest
  const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;

  while (true) {
    try {
      // 1️⃣ Fetch open short positions from DB
      const openPositions = await fetchOpenPositions();

      for (const pos of openPositions) {
        // 2️⃣ Extract values from DB position object
        const userKey = new PublicKey(pos.user);
        const mintKey = new PublicKey(pos.mint);

        // For DB-based positions, we can just use positionId as a dummy PDA
        const positionPubkey = new PublicKey(pos.mint); 
        const positionIdAnchorBn = new anchor.BN(pos.positionId);

        const entryPriceInUsd = pos.entryPrice;

        const borrowedTokens = BigInt(pos.borrowedTokens ?? 0);
        const reservedCollateral = BigInt(pos.reservedCollateral ?? 0);
        const liquidationPriceInUsd = pos.liquidate;
        // console.log("liquidationPriceInUsd", liquidationPriceInUsd);
        const createdAt = pos.createdAt;

        if (!entryPriceInUsd || !createdAt) {
          console.warn(`❌ Missing liquidation data for position ${positionIdAnchorBn.toString()}`);
          continue;
        }

        // 3️⃣ Get current token price
        const currentPrice = await fetchCurrentPrice(mintKey.toString());
        // console.log("Current Price", currentPrice)

        // 4️⃣ Adjust liquidation price for APR and buffer
        const now = Math.floor(Date.now() / 1000);
        const secondsOpen = now - createdAt;
        const yearsOpen = secondsOpen / SECONDS_IN_YEAR;
        const interestFactor = Math.pow(1 + APR, yearsOpen);
        const collateralBufferFactor = 1 - 0.03; // 3% buffer
        const liquidationPriceAdjusted = liquidationPriceInUsd * interestFactor * collateralBufferFactor;

        // console.log(`Position ${positionIdAnchorBn.toString()} | Entry: ${entryPriceInUsd} | Current: ${currentPrice} | Adjusted Liquidation: ${liquidationPriceAdjusted}`);

        // 5️⃣ Trigger liquidation if price crosses threshold
        if (currentPrice >= liquidationPriceAdjusted) {
          console.log(`⚠️ Liquidation trigger for ${positionIdAnchorBn.toString()}`);
          try {
            const sig = await liquidatePositionOnChain(
              userKey,
              positionIdAnchorBn,
              mintKey
            );
            console.log(`✅ Liquidated ${positionIdAnchorBn.toString()} tx: ${sig}`);
          } catch (err) {
            console.error('❌ Liquidation tx error:', err);
          }
        }
      }
    } catch (err) {
      console.error('Bot error:', err);
    }

    await sleep(15_000); // scan every 15 seconds
  }
}


if (require.main === module) {
  startOnChainLiquidationBot().catch((e) => {
    console.error('Fatal bot error:', e);
    process.exit(1);
  });
}
