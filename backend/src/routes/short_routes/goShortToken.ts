import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { randomUUID } from 'crypto';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import {getCachedSolUsdPrice} from '../price_routes/priceService';


const goShortRoute: FastifyPluginAsync = async (server) => {
  server.post('/go-short', async (req, reply) => {
    const {
      user,
      mint,
      collateralAmount,
      collateralPercent,
      entryPriceSOL,
      minTokensOut: minTokensOutStr,
      tempWSOLAccount,
    } = req.body as {
      user: string;
      mint: string;
      collateralAmount: number;
      collateralPercent: number;
      entryPriceSOL: number;
      minTokensOut: string;
      tempWSOLAccount: string;
    };

    try {

      const solToUsd = await getCachedSolUsdPrice();

      if (collateralAmount <= 0) {
        return reply.send({
            success: false,
            claimable: 0,
            message: "SOL amount must be greater than 0"
          });
      }

      if (collateralPercent > 50) {
        return reply.send({
            success: false,
            claimable: 0,
            message: "Collateral percentage too high. Max allowed is 50%."
          });
      }
      
      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);
      const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
      const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
      const position_id = Date.now() + Math.floor(Math.random() * 1000);
      
      const lamports = (collateralAmount * LAMPORTS_PER_SOL);

      const borrowPct = collateralPercent / 100;
      const liquidationPriceSOL = entryPriceSOL * ((1 - borrowPct) / borrowPct);
      const liquidationPrice = liquidationPriceSOL * solToUsd;
      const scale_factor = 1_000_000_000;
      const stored_value = Math.round(liquidationPrice * scale_factor);

      const minTokensOut = new anchor.BN(minTokensOutStr);

      const userTokenAccount = getAssociatedTokenAddressSync(mintKey, userKey);

      // PDAs
      const [vaultConfig] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_config'),
        mintKey.toBuffer(),
      ], program.programId);

      const [tokenConfig] = PublicKey.findProgramAddressSync([
        Buffer.from('config'),
        mintKey.toBuffer(),
      ], program.programId);

      const [vaultAuthority] = PublicKey.findProgramAddressSync([
        Buffer.from('vault'),
        mintKey.toBuffer(),
      ], program.programId);

      const [tokenLiquidityVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_liquidity'),
        mintKey.toBuffer(),
      ], program.programId);

      const [wsolLiquidityVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_wsol'),
        mintKey.toBuffer(),
      ], program.programId);

      const [lendingVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_lending'),
        mintKey.toBuffer(),
      ], program.programId);

      const [platformVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_platform'),
        mintKey.toBuffer(),
      ], program.programId);

      const [projectVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_project'), mintKey.toBuffer()],
        program.programId
      );

      const [lendingVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_lending_authority'), mintKey.toBuffer()],
        program.programId
      );

      // Derive user Position PDA
      const [positionPDA] = PublicKey.findProgramAddressSync([
        Buffer.from("position"),
        userKey.toBuffer(),
        mintKey.toBuffer(),
        new anchor.BN(position_id).toArrayLike(Buffer, 'le', 8),
      ], program.programId);

      const [yieldVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('yield_vault'), mintKey.toBuffer()],
          program.programId
      );

      // Referral logic
      let referrerSolAccount: PublicKey;
      const dbUser = await prisma.user.findUnique({
        where: { wallet: user },
        include: { referredBy: true },
      });

      let isReferral = false;
      if (dbUser?.referredBy?.wallet && dbUser.referredBy.wallet !== user) {
        referrerSolAccount = new PublicKey(dbUser.referredBy.wallet);
        isReferral = true;
      } else {
        referrerSolAccount = platformVault;
      }

      const [referralTracker] = PublicKey.findProgramAddressSync([
        Buffer.from('referral_vault'),
        referrerSolAccount.toBuffer(),
      ], program.programId);

      const [referralTokenVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_referral_token'),
        referrerSolAccount.toBuffer(),
      ], program.programId);

      const [referralVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_referral_authority'), referrerSolAccount.toBuffer(),],
        program.programId
      );

      // Create WSOL temp account
      const instructions: TransactionInstruction[] = [];

      const rentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(165);
      const wrapLamports = lamports;

      const createWSOLIx = SystemProgram.createAccount({
        fromPubkey: userKey,
        newAccountPubkey: tempWSOLAccountKey,
        lamports: rentExempt + wrapLamports,
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      });

      const initWSOLIx = createInitializeAccountInstruction(
        tempWSOLAccountKey,
        WSOL_MINT,
        userKey
      );

      const syncIx = createSyncNativeInstruction(tempWSOLAccountKey);

      instructions.push(createWSOLIx, initWSOLIx, syncIx);

      const ix = await program.methods
        .goShort({
          collateralAmount: new anchor.BN(lamports),
          minTokensBorrowed: minTokensOut,
          positionId: new anchor.BN(position_id),
          collateralPercentage: collateralPercent,
          liquidationPrice: new anchor.BN(stored_value),
        })
        .accounts({
          user: userKey,
          wsolMint: WSOL_MINT,
          userCollateralAccount: tempWSOLAccountKey,
          mint: mintKey,
          tempWsolAccount: tempWSOLAccountKey,
          tempWsolAuthority: userKey,
          platformVault,
          vaultConfig,
          tokenConfig,
          projectVault,
          referralVaultAuthority,
          vaultAuthority,
          wsolLiquidityVault,
          lendingVault,
          lendingVaultAuthority: lendingVaultAuthority,
          tokenLiquidityVault,
          position: positionPDA,
          referralTracker,
          referralTokenVault,    
          referrer: referrerSolAccount,
          yieldVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      instructions.push(ix);

      const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash();

      const tx = new Transaction({
        feePayer: userKey,
        blockhash,
        lastValidBlockHeight,
      });

      for (const ix of instructions) {
        tx.add(ix);
      }

      return reply.send({
        success: true,
        positionId: position_id,
        tx: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      });
    } catch (err: any) {
      console.error('❌ Go Short Error:', err);
      return reply.status(500).send({ success: false, claimable: 0, message: err.message });
    }
  });

};

export default goShortRoute;
