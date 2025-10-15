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

interface YieldVault {
  mint: PublicKey;              // Pubkey
  apr_bps: number;           // u16
  total_staked: anchor.BN;      // u64
  accRewardPerShare: anchor.BN; // u128
  last_accrual_ts: anchor.BN;   // i64
  bump: number;              // u8
}

interface UserYieldPosition {
  owner: PublicKey;             // Pubkey
  mint: PublicKey;              // Pubkey
  is_creator: boolean;       // bool
  deposited: anchor.BN;         // u64
  rewardDebt: anchor.BN;       // u128
  claimed_total: anchor.BN;     // u64
  deposited_at: anchor.BN;      // i64
  last_action_ts: anchor.BN;    // i64
  bump: number;              // u8
}

const claimYieldRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/claim-yield', async (req, reply) => {
    try {
        const { user, mint, tempWSOLAccount } = req.body as {
            user: string;
            mint: string;
            tempWSOLAccount: string;
        };

        const userKey = new PublicKey(user);
        const mintKey = new PublicKey(mint);
        const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

        const userTokenAccount = getAssociatedTokenAddressSync(WSOL_MINT, userKey, false);
     
        // ---------------------------
        // Derive PDAs
        // ---------------------------
        const [yieldVault] = PublicKey.findProgramAddressSync(
            [Buffer.from('yield_vault'), mintKey.toBuffer()],
            program.programId
        );

        const [userYieldPosition] = PublicKey.findProgramAddressSync(
            [Buffer.from('user_yield'), mintKey.toBuffer(), userKey.toBuffer()],
            program.programId
        );

        const [projectVault] = PublicKey.findProgramAddressSync([
          Buffer.from('vault_project'),
          mintKey.toBuffer(),
        ], program.programId);

        const [vaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), mintKey.toBuffer()],
            program.programId
        );

       
        const [userYieldPositionAcc, vaultAcc] = await Promise.all([
            (program.account as any).userYieldPosition.fetch(userYieldPosition) as Promise<UserYieldPosition>,
            (program.account as any).yieldVault.fetch(yieldVault) as Promise<YieldVault>
        ]);
        

        if (!userYieldPositionAcc || !userYieldPositionAcc.owner.equals(userKey)) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "User has no yield position or does not own it"
          });
        }

        if (!userYieldPositionAcc.mint.equals(mintKey)) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "User has no mint yield position or does not own this mint"
          });
        }

        if (!vaultAcc || !vaultAcc.accRewardPerShare) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Vault has no accumulated rewards yet"
          });
        }

        // Use proper BN operations
        const PRECISION = new anchor.BN(1_000_000_000_000);
        const pending = userYieldPositionAcc.deposited
          .mul(vaultAcc.accRewardPerShare)
          .div(PRECISION)
          .sub(userYieldPositionAcc.rewardDebt);

        // If pending is zero, return gracefully
        if (pending.lte(new anchor.BN(0))) {
          return reply.send({
            success: true,
            claimable: 0,
            message: "No rewards available to claim"
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
            .claimRewards()
            .accounts({
            user: userKey,
            mint: mintKey,
            yieldVault: yieldVault,
            userYieldPosition: userYieldPosition,
            wsolMint: WSOL_MINT,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
            projectVault,
            vaultAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
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

export default claimYieldRoute;
