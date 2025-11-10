import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  Transaction,
  Keypair,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import fs from 'fs';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';

export const BOT_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf-8')))
);

const joinPresaleRoute: FastifyPluginAsync = async (server) => {
  server.post('/join-presale', async (req, reply) => {
    const { user, mint, amount, minTokensOut: minTokensOutStr, tempWSOLAccount,} = req.body as {
      user: string;
      mint: string;
      amount: number; // In SOL
      minTokensOut: string;
      tempWSOLAccount: string;
    };

     try {
    
  
        if (amount <= 0) {
          return reply.send({
              success: false,
              claimable: 0,
              message: "SOL amount must be greater than 0"
            });
        }

        const userKey = new PublicKey(user);
        const mintKey = new PublicKey(mint);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
        const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
        const position_id = Date.now() + Math.floor(Math.random() * 1000);
        
        const lamports = (amount * LAMPORTS_PER_SOL);
  
        const minTokensOut = new anchor.BN(minTokensOutStr);
  
        const userTokenAccount = getAssociatedTokenAddressSync(mintKey, userKey, false);
  
        // PDAs
     
        const [tokenConfig] = PublicKey.findProgramAddressSync([
          Buffer.from('config'),
          mintKey.toBuffer(),
        ], program.programId);
  
        const [vaultAuthority] = PublicKey.findProgramAddressSync([
          Buffer.from('vault'),
          mintKey.toBuffer(),
        ], program.programId);
  
        const [liquiditySolVault] = PublicKey.findProgramAddressSync([
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
  
        const [lendingVaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_lending_authority'), mintKey.toBuffer()],
          program.programId
        );
  
        // Derive user Position PDA
        const [userPresalePosition] = PublicKey.findProgramAddressSync([
          Buffer.from("user_presale_position"),
          userKey.toBuffer(),
          mintKey.toBuffer(),
        ], program.programId);
  
        const [yieldVault] = PublicKey.findProgramAddressSync(
            [Buffer.from('yield_vault'), mintKey.toBuffer()],
            program.programId
        );
  
        const [vaultConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_config'), mintKey.toBuffer()],
          program.programId
        );
  
        // Create WSOL temp account
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

        const botWsolAccount = getAssociatedTokenAddressSync(
          WSOL_MINT,
          BOT_KEYPAIR.publicKey
        );

        const botAtaInfo = await program.provider.connection.getAccountInfo(botWsolAccount);
        if (!botAtaInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              userKey, // payer
              botWsolAccount,        // account to create
              BOT_KEYPAIR.publicKey, // owner
              WSOL_MINT
            )
          );
        }
  
        const ix = await program.methods
          .joinPresale({
            solAmount: new anchor.BN(lamports),
            minTokens: minTokensOut,
            positionId: new anchor.BN(position_id),
          })
          .accounts({
            user: userKey,
            wsolMint: WSOL_MINT,
            mint: mintKey,
            userTokenAccount,
            tempWsolAccount: tempWSOLAccountKey,
            tempWsolAuthority: userKey,
            platformVault,
            tokenConfig,
            vaultConfig,
            vaultAuthority,
            liquiditySolVault,
            lendingVault,
            lendingVaultAuthority: lendingVaultAuthority,
            userPresalePosition,
            botWsolAccount: botWsolAccount,
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
          tx: tx.serialize({ requireAllSignatures: false }).toString("base64"),
        });
      } catch (err: any) {
        console.error('❌ Presale Error:', err);
        return reply.status(500).send({ success: false, claimable: 0, message: err.message });
      }
  });
};

export default joinPresaleRoute;
