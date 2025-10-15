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
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
  createSetAuthorityInstruction,
  createSyncNativeInstruction
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';

const buyTokenRoute: FastifyPluginAsync = async (server) => {
  server.post('/buy-token', async (req, reply) => {
    const { user, mint, solAmount, minTokensOut: minTokensOutStr, tempWSOLAccount } = req.body as {
      user: string;
      mint: string;
      solAmount: number;
      minTokensOut: string;
      tempWSOLAccount: string;
    };

    const minTokensOut = new anchor.BN(minTokensOutStr);

    try {
      if (solAmount <= 0) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "SOL amount must be greater than 0"
          });
      }

      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);
      const lamports = new anchor.BN(Math.floor(solAmount * anchor.web3.LAMPORTS_PER_SOL));
      const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); 
      const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
      const position_id = Date.now() + Math.floor(Math.random() * 1000);
      const userTokenAccount = getAssociatedTokenAddressSync(mintKey, userKey, false);

      // Derive all necessary PDAs
      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );
      
      const [tokenConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mintKey.toBuffer()],
        program.programId
      );

      const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityTokenVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity_authority'), mintKey.toBuffer()],
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

      const [yieldVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('yield_vault'), mintKey.toBuffer()],
          program.programId
      );

      // Check token vault balance
      const tokenVaultInfo = await program.provider.connection.getTokenAccountBalance(liquidityTokenVault);
      if (!tokenVaultInfo || !tokenVaultInfo.value) {
        return reply.send({
            success: true,
            claimable: 0,
            message: "Could not fetch token vault balance"
          });
      }

      const tokenReserveBN = new anchor.BN(tokenVaultInfo.value.amount);
      const maxAllowed = tokenReserveBN.divn(2);

      if (minTokensOut.gt(maxAllowed)) {
        return reply.send({
            success: true,
            claimable: 0,
            message: `Requested minimum tokens (${minTokensOut.toString()}) exceeds 50% of pool (${maxAllowed.toString()})`
          });
      }

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

      const [referralVault] = PublicKey.findProgramAddressSync(
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


      const instructions: TransactionInstruction[] = [];

      // Create user token account if needed
      const ataInfo = await program.provider.connection.getAccountInfo(userTokenAccount);
      if (!ataInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            userKey,
            userTokenAccount,
            userKey,
            mintKey
          )
        );
      }

      // Create and initialize WSOL token account
      const rentExemptBalance = await program.provider.connection.getMinimumBalanceForRentExemption(165);
      const wrapLamports = lamports.toNumber();

      const userBalance = await program.provider.connection.getBalance(userKey);
      const totalRequired = rentExemptBalance + wrapLamports;

      if (userBalance < totalRequired) {
        return reply.send({
            success: true,
            claimable: 0,
            message: `Insufficient SOL. Needs ${totalRequired / anchor.web3.LAMPORTS_PER_SOL} SOL`
          });
      }
            
      
      const createTempAccountIx = SystemProgram.createAccount({
        fromPubkey: userKey,
        newAccountPubkey: tempWSOLAccountKey,
        lamports: rentExemptBalance + wrapLamports,
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      });
      const initTempAccountIx = createInitializeAccountInstruction(
        tempWSOLAccountKey,
        WSOL_MINT,
        userKey,
      );
      const syncIx = createSyncNativeInstruction(tempWSOLAccountKey);
      instructions.push(createTempAccountIx, initTempAccountIx, syncIx);
      

      // Compose the buy instruction
      const ix = await program.methods
        .buyToken({
          solAmount: lamports,
          minTokensOut: minTokensOut,
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
          liquidityTokenVaultAuthority,
          liquiditySolVault,
          vaultConfig,
          tokenConfig,
          projectVault,
          platformVault,
          vaultAuthority,
          referralVaultAuthority,
          referralVault,
          referrer: referrerSolAccount,
          referralTokenVault: referralTokenVault,
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
        minTokensOut:minTokensOut,
        tx: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      });
    } catch (err: any) {
      console.error('❌ Buy token failed:', err);
      return reply.status(500).send({ success: false, claimable: 0, message: err.message });
    }
  });

};

export default buyTokenRoute;