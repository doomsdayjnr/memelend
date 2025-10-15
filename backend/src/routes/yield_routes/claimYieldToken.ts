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
  createAssociatedTokenAccountInstruction,
  createInitializeAccountInstruction,
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';

interface UserYieldPosition {
  owner: PublicKey;       
  mint: PublicKey;       
  is_creator: boolean;
  deposited: anchor.BN;  
  reward_debt: anchor.BN; 
  claimed_total: anchor.BN; 
  deposited_at: anchor.BN;  
  last_action_ts: anchor.BN; 
  bump: number;           
}

interface TokenConfig {
  creator: PublicKey;                
}

const claimYieldTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/claim-yield-token', async (req, reply) => {
    try {
        const { userPublicKey, mint, position_id, tempWSOLAccount } = req.body as {
            userPublicKey: string;
            mint: string;
            position_id: number;
            tempWSOLAccount: string;
        };
        

        const userKey = new PublicKey(userPublicKey);
        const mintKey = new PublicKey(mint);
        const tempWSOLAccountKey = new PublicKey(tempWSOLAccount);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

        const userTokenAccount = getAssociatedTokenAddressSync(mintKey, userKey, false);
        const userSolAccount = getAssociatedTokenAddressSync(WSOL_MINT, userKey);

        // Pull the exact position from DB
        const position = await prisma.yieldPosition.findUnique({
          where: { 
              userWallet: userPublicKey,
              positionId: position_id,
          },  // since you declared positionId as BigInt
        });


        if (!position) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Position not found"
          });
        }

        // Make sure this is an open position
        if (!position.isOpen) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Position already closed"
          });
        }

        // tokensOut from DB is the exact amount this user can sell
        const tokensOutDb = new anchor.BN(position.deposited?.toString() || "0");
        if (tokensOutDb.isZero()) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Position has 0 tokensOut"
          });
        }

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

        const [projectVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_project'), mintKey.toBuffer()],
          program.programId
        );

        const [lendingVaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault_lending_authority'), mintKey.toBuffer()],
            program.programId
        );

        const [vaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault'), mintKey.toBuffer()],
          program.programId
        );

        const [tokenConfigPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('config'), mintKey.toBuffer()],
          program.programId
        );

        // Check token vault balance
        const lendingVaultInfo = await program.provider.connection.getTokenAccountBalance(lendingVault);
        if (!lendingVaultInfo || !lendingVaultInfo.value) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Could not fetch token vault balance"
          });
        }
        const lendingReserveBN = new anchor.BN(lendingVaultInfo.value.amount);


        // Fetch all needed accounts with proper typing
        const [tokenConfig, yieldAccountInfo] = await Promise.all([
          (program.account as any).tokenConfig.fetch(tokenConfigPda) as Promise<TokenConfig>,
          (program.account as any).userYieldPosition.fetch(userYieldPosition) as Promise<UserYieldPosition>
        ]);

        if (!yieldAccountInfo) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Could not fetch vault balances"
          });
        }

        // 🚫 Block creators from using this withdrawal route
        if (tokenConfig.creator.equals(userKey)) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Creators are not allowed to withdraw here"
          });
        }

        const depositedBN = yieldAccountInfo.deposited;
        const claimedTotal = yieldAccountInfo.claimed_total;

        console.log("depositedBN", depositedBN);
      
        if (depositedBN.isZero()) {
          return reply.send({
            success: false,
            claimable: 0,
            message: "Insufficient liquidity in vaults"
          });
        }
      
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
          .withdrawYield(
            tokensOutDb,
            new anchor.BN(position_id)
          )
          .accounts({
          user: userKey,
          yieldVault: yieldVault,
          userYieldPosition: userYieldPosition,
          lendingVault: lendingVault,
          wsolMint: WSOL_MINT,
          mint: mintKey,
          tempWsolAccount: tempWSOLAccountKey,
          tempWsolAuthority: userKey,
          vaultAuthority: vaultAuthority,
          projectVault,
          lendingVaultAuthority: lendingVaultAuthority,
          userTokenAccount: userTokenAccount,
          tokenConfig:tokenConfigPda,
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

export default claimYieldTokenRoute;
