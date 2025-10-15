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


const claimPresaleEarningsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/claim-presale-earnings', async (req, reply) => {
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

        const [userPreSalePosition] = PublicKey.findProgramAddressSync([
            Buffer.from("user_presale_position"), userKey.toBuffer(),
            mintKey.toBuffer()], 
            program.programId
        );

        const [projectVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_project'), mintKey.toBuffer()],
          program.programId
        );

        const [vaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), mintKey.toBuffer()],
            program.programId
        );

        const [tokenConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('config'), mintKey.toBuffer()],
          program.programId
        );

       
        const [userPresalePositionAcc, vaultAcc] = await Promise.all([
            (program.account as any).userPreSalePosition.fetch(userPreSalePosition) as Promise<any>,
            (program.account as any).tokenConfig.fetch(tokenConfig) as Promise<any>
        ]);
        

        if (!userPresalePositionAcc || !userPresalePositionAcc.user.equals(userKey)) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "User has no position or does not own it"
          });
        }

        if (!userPresalePositionAcc.mint.equals(mintKey)) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "User position does not match this mint."
          });
        }

        if (!vaultAcc || !vaultAcc.preSaleAccFeePerShare) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "No accumulated rewards available."
          });
        }

        // Use proper BN operations
        const PRECISION = new anchor.BN(1_000_000_000_000);
        const pending = userPresalePositionAcc.initialBought
          .mul(vaultAcc.preSaleAccFeePerShare)
          .div(PRECISION)
          .sub(userPresalePositionAcc.feeDebt);

        // If pending is zero, return gracefully
        if (pending.lte(new anchor.BN(0))) {
          return reply.send({
            success: true,
            claimable: 0,
            message: "No rewards available to claim."
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
            .claimPresaleRewards()
            .accounts({
            user: userKey,
            mint: mintKey,
            yieldVault,
            tokenConfig,
            wsolMint: WSOL_MINT,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
            userPresalePosition:userPreSalePosition,
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

export default claimPresaleEarningsRoute;
