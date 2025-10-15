import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeAccountInstruction,
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';


const claimReferralRewardsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/claim', async (req, reply) => {
    try {
        const { user, tempWSOLAccount } = req.body as {
            user: string;
            tempWSOLAccount: string;
        };

        const userKey = new PublicKey(user);
        const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

        // ---------------------------
        // Derive PDAs
        // ---------------------------
       
        const [referralTracking] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault_referral'), userKey.toBuffer()],
            program.programId
        );

        const [referralTokenVault] = PublicKey.findProgramAddressSync([
          Buffer.from('vault_referral_token'),
          userKey.toBuffer(),
        ], program.programId);

        const [referralVaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault_referral_authority'), userKey.toBuffer()],
            program.programId
        );

       
        const [referralTrackingAcc] = await Promise.all([
            (program.account as any).referralVault.fetch(referralTracking) as Promise<any>,
        ]);
        

        if (!referralTrackingAcc || !referralTrackingAcc.pendingRewards) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Vault has no pending rewards yet"
          });
        }

        const claimable = referralTrackingAcc.pendingRewards.toNumber();

        if (claimable === 0) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "No earnings available to withdraw."
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
        
        // ---------------------------
        // Deposit Yield Instruction
        // ---------------------------
        const ix = await program.methods
            .claimReferralRewards()
            .accounts({
            user: userKey,
            wsolMint: WSOL_MINT,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
            referralTracking,
            referralVaultAuthority,
            referralTokenVault,
            referrer: userKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction();

        instructions.push(ix);

        const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash('finalized');
        const tx = new Transaction({
            feePayer: userKey,
            blockhash,
            lastValidBlockHeight,
        });
     
        for (const ix of instructions) {
            tx.add(ix);
        }

        tx.signatures.push({
            publicKey: userKey,
            signature: null,
        });

      return reply.send({
        success: true,
        tx: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      });
    } catch (err: any) {
      console.error(err);
      reply.status(500).send({ success: false, claimable: 0, message: err.message });
    }
  });
};

export default claimReferralRewardsRoute;
