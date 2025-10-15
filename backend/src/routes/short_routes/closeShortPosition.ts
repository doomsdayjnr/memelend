import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeAccountInstruction,
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';


const closeShortPositionRoute: FastifyPluginAsync = async (server) => {
  server.post('/close-short', async (req, reply) => {
    const {
      user,
      mint,
      minTokenAmountToRepay,
      positionId,
      tempWSOLAccount,
    } = req.body as {
      user: string;
      mint: string;
      minTokenAmountToRepay: string;
      positionId: number;
      tempWSOLAccount: string;
    };

    try {
      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);
      const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
      const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
      const userSolAccount = getAssociatedTokenAddressSync(WSOL_MINT, userKey);

      const minTokensRepay = new anchor.BN(minTokenAmountToRepay);

      // PDAs
      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );

      const [tokenVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_token_authority'), mintKey.toBuffer()],
        program.programId
      );

      const [tokenConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mintKey.toBuffer()],
        program.programId
      );

      const [tokenLiquidityVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      const [wsolLiquidityVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol'), mintKey.toBuffer()],
        program.programId
      );

      const [lendingVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_lending'), mintKey.toBuffer()],
        program.programId
      );

      const [VaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), mintKey.toBuffer()],
        program.programId
      );
      
      const [platformVault] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_platform'),
        mintKey.toBuffer(),
      ], program.programId);

      const [projectVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_project'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityVaultAuth] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_liquidity_authority'),
        mintKey.toBuffer(),
      ], program.programId);

      const [WSolVaultAuth] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_wsol_authority'),
        mintKey.toBuffer(),
      ], program.programId);

      const [yieldVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('yield_vault'), mintKey.toBuffer()],
          program.programId
      );

      const positionIdBn = new anchor.BN(positionId);
      const positionIdBuffer = positionIdBn.toArrayLike(Buffer, 'le', 8);

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('position'),
          userKey.toBuffer(),
          mintKey.toBuffer(),
          positionIdBuffer,
        ],
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
      

      const positionAccountInfo = await program.provider.connection.getAccountInfo(positionPDA);
      if (!positionAccountInfo) {
        return reply.send({
            success: true,
            claimable: 0,
            message: `Position not found`
          });
      }

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


      const ix = await program.methods
        .closePosition({
          positionId: new anchor.BN(positionId),
          minTokenRepay: minTokensRepay,
        })
        .accounts({
          user: userKey,
          mint: mintKey,
          tempWsolAccount: tempWSOLAccountKey,
          tempWsolAuthority: userKey,
          tokenLiquidityVault,
          liquiditySolVault: wsolLiquidityVault,
          wsolMint: WSOL_MINT,
          userSolAccount,
          lendingVault,
          projectVault,
          VaultAuthority,
          WSolVaultAuth,
          liquidityVaultAuth,
          tokenVaultAuthority,
          referralVaultAuthority,
          platformVault,
          yieldVault,
          vaultConfig,
          tokenConfig,
          referralTracker,
          referralTokenVault,    
          referrer: referrerSolAccount,
          position: positionPDA,
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
      }).add(...instructions);

      return reply.send({
        success: true,
        tx: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      });
    } catch (err: any) {
      console.error('❌ Close Short Error:', err);
      return reply.status(500).send({ success: false, claimable: 0, message: err.message });
    }
  });
};

export default closeShortPositionRoute;
