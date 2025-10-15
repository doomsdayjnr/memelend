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

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");


const yieldDepositRoute: FastifyPluginAsync = async (server) => {
  server.post('/yield-deposit', async (req, reply) => {
        const { user, mint, tempWSOLAccount, position_id } = req.body as {
          user: string;
          mint: string;
          tempWSOLAccount: string;
          position_id: number;
        };
    
        try {
    
            const userKey = new PublicKey(user);
            const mintKey = new PublicKey(mint);
            const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
            const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

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
                success: false,
                claimable: 0,
                message: "error: 'Position not found' "
              });
            }

            // Make sure this is an open position
            if (!position.isOpen) {
              return reply.send({
                success: false,
                claimable: 0,
                message: "error: 'Position already closed' "
              });
            }

            // tokensOut from DB is the exact amount this user can sell
            const tokensOutDb = new anchor.BN(position.tokensOut?.toString() || "0");
            if (tokensOutDb.isZero()) {
              return reply.send({
                success: false,
                claimable: 0,
                message: "error: 'Position has 0 tokensOut' "
              });
            }

            // Fetch user balance (safety check to ensure they still have enough tokens)
            const tokenBalanceInfo = await program.provider.connection.getTokenAccountBalance(userTokenAccount);
            if (!tokenBalanceInfo?.value) {
              return reply.send({
                success: false,
                claimable: 0,
                message: "error: 'Could not fetch user token balance' "
              });
            
            }

            // console.log("tokenBalanceInfo", tokenBalanceInfo);

            const userBalanceRaw = new anchor.BN(tokenBalanceInfo.value.amount);
            // console.log("userBalanceRaw", userBalanceRaw);
      
            if (userBalanceRaw.lt(tokensOutDb)) {
              return reply.send({
                success: false,
                claimable: 0,
                message: `error: Insufficient token balance. Required: ${tokensOutDb.toString()}, Available: ${userBalanceRaw.toString()}`
              });
            }

            // Final amount to sell = tokensOut from DB
            const tokenAmount = tokensOutDb;

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

            const [lendingVault] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_lending'), mintKey.toBuffer()],
                program.programId
            );

            const [tokenConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from('config'), mintKey.toBuffer()],
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
            .yieldDeposit(
            tokenAmount, 
            new anchor.BN(position_id)
            )
            .accounts({
            yieldVault: yieldVault,
            owner: userKey,
            userYieldPosition: userYieldPosition,
            wsolMint: WSOL_MINT,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
            lendingVault: lendingVault,
            mint: mintKey,
            tokenConfig: tokenConfig,
            projectVault,
            vaultAuthority: vaultAuthority,
            userTokenAccount: userTokenAccount,
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
          console.error('❌ Staking failed:', err);
          return reply.status(500).send({ success: false, claimable: 0, message: err.message });
        }
    });
};

export default yieldDepositRoute;
