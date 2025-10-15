import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  Keypair,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
  createSyncNativeInstruction
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';



const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

const sellTokenRoute: FastifyPluginAsync = async (server) => {
  server.post('/sell-token', async (req, reply) => {
    const { user, mint, minSolOut: minSolOutStr, tokenAmount: minTokenAmountStr, tempWSOLAccount, position_id } = req.body as {
      user: string;
      mint: string;
      minSolOut: string;
      tokenAmount:string;
      tempWSOLAccount: string;
      position_id: number;
    };

    try {

      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);
      const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
      const minSolOut = new anchor.BN(minSolOutStr);
      const tokenAmount = new anchor.BN(minTokenAmountStr);
      console.log("minSolOut", minSolOut.toString());
      console.log("tokenAmount", tokenAmount.toString());

      const userTokenAccount = getAssociatedTokenAddressSync(mintKey, userKey, false);

      // Pull the exact position from DB
      const position = await prisma.position.findUnique({
        where: { 
          userWallet: user,
          positionId: position_id,
         },  // since you declared positionId as BigInt
      });

      if (!position) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Position not found"
          });
      }

      // Make sure this is an open position
      if (!position.isOpen) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Position already closed"
          });
      }

      // tokensOut from DB is the exact amount this user can sell
      const tokensOutDb = new anchor.BN(position.tokensOut?.toString() || "0");
     
      if (tokensOutDb.isZero()) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Position has 0 tokensOut"
          });
      }

      // Fetch user balance (safety check to ensure they still have enough tokens)
      const tokenBalanceInfo = await program.provider.connection.getTokenAccountBalance(userTokenAccount);
      
      if (!tokenBalanceInfo?.value) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Could not fetch user token balance"
          });
      }

      const userBalanceRaw = new anchor.BN(tokenBalanceInfo.value.amount);
      
      if (userBalanceRaw.lt(tokensOutDb)) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Insufficient token balance."
          });
      }


      // Derive all necessary PDAs
      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );
      
      const [tokenConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      const [liquiditySolVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol'), mintKey.toBuffer()],
        program.programId
      );

      const [projectVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_project'), mintKey.toBuffer()],
        program.programId
      );

      const [platformVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_platform'), mintKey.toBuffer()],
        program.programId
      );

      const [wsolVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol_authority'), mintKey.toBuffer()],
        program.programId
      );

      const [yieldVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('yield_vault'), mintKey.toBuffer()],
          program.programId
      );

      // Handle referral logic
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

      const [referralTracking] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_referral'), referrerSolAccount.toBuffer()],
        program.programId
      );

      const [referralTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_referral_token'), referrerSolAccount.toBuffer()],
        program.programId
      );

      const [referralVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_referral_authority'), referrerSolAccount.toBuffer(),],
        program.programId
      );

      // Get vault reserves
      const [tokenVaultInfo, solVaultInfo] = await Promise.all([
        program.provider.connection.getTokenAccountBalance(liquidityTokenVault),
        program.provider.connection.getTokenAccountBalance(liquiditySolVault),
      ]);

      if (!tokenVaultInfo || !solVaultInfo) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Could not fetch vault balances"
          });
      }

      const tokenReserve = new anchor.BN(tokenVaultInfo.value.amount);
      const solReserve = new anchor.BN(solVaultInfo.value.amount);

      const instructions: TransactionInstruction[] = [];

      // Create temp WSOL account if needed
      const tempWSOLAccountInfo = await program.provider.connection.getAccountInfo(tempWSOLAccountKey);
      if (!tempWSOLAccountInfo) {
        const rentExemptBalance = await program.provider.connection.getMinimumBalanceForRentExemption(165);
        
        instructions.push(
          SystemProgram.createAccount({
            fromPubkey: userKey,
            newAccountPubkey: tempWSOLAccountKey,
            lamports: rentExemptBalance,
            space: 165,
            programId: TOKEN_PROGRAM_ID,
          })
        );

        instructions.push(
          createInitializeAccountInstruction(
            tempWSOLAccountKey,
            WSOL_MINT,
            userKey
          )
        );
      }


      // Compose the sell instruction
      const ix = await program.methods
        .sellToken({
          tokenAmount,
          minSolOut,
          positionId: new anchor.BN(position_id),
        })
        .accounts({
          user: userKey,
          wsolMint: WSOL_MINT,
          mint: mintKey,
          tempWsolAccount: tempWSOLAccountKey,
          tempWsolAuthority: userKey,
          userTokenAccount,
          liquidityTokenVault,
          liquiditySolVault,
          vaultConfig,
          tokenConfig,
          projectVault,
          platformVault,
          referralTracking,
          referralTokenVault,
          referralVaultAuthority,
          referrer: referrerSolAccount,
          wsolVaultAuthority: wsolVaultAuthority,
          yieldVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      instructions.push(ix);

      // Create transaction
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
        tx: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      });
    } catch (err: any) {
      console.error('❌ Sell token failed:', err);
      return reply.status(500).send({ success: false, claimable: 0, message: err.message });
    }
  });

};

export default sellTokenRoute;