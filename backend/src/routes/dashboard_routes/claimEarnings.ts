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
  totalEarned: any;
  mint: PublicKey;              // Pubkey
  apr_bps: number;           // u16
  total_staked: anchor.BN;      // u64
  accRewardPerShare: anchor.BN; // u128
  last_accrual_ts: anchor.BN;   // i64
  bump: number;              // u8
}


const claimEarningsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/claim-earnings', async (req, reply) => {
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

        const [vaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), mintKey.toBuffer()],
            program.programId
        );

        const [vaultConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_config'), mintKey.toBuffer()],
          program.programId
        );

        const [projectVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_project'), mintKey.toBuffer()],
          program.programId
        );

       
        const [vaultAcc] = await Promise.all([
          (program.account as any).yieldVault.fetch(yieldVault) as Promise<YieldVault>
        ]);

        // BN to number
        const totalEarned = Number(vaultAcc.totalEarned);

        if (totalEarned === 0) {
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
            .claimEarnings()
            .accounts({
            user: userKey,
            mint: mintKey,
            yieldVault,
            vaultConfig,
            projectVault,
            wsolMint: WSOL_MINT,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
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

export default claimEarningsRoute;
