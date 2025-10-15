import { FastifyPluginAsync } from 'fastify';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import axios from 'axios';

const addLiquidityRoute: FastifyPluginAsync = async (server) => {
  server.post('/add-liquidity', async (req, reply) => {
    const { creator, mint, amount } = req.body as {
      creator: string;
      mint: string;
      amount: number; // In SOL
    };

    try {
      const creatorKey = new PublicKey(creator);
      const mintKey = new PublicKey(mint);
      const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
      const lamports = anchor.web3.LAMPORTS_PER_SOL * amount;

      if (amount <= 0) {
        return reply.status(400).send({ error: 'Amount must be greater than 0' });
      }

      const [wsolLiquidityVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol'), mintKey.toBuffer()],
        program.programId
      );

      const [wsolVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol_authority'), mintKey.toBuffer()],
        program.programId
      );

      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );
      
      // Use WSOL_MINT for ATA creation regardless of the token being launched
      const creatorWSOLAccount = getAssociatedTokenAddressSync(
        WSOL_MINT,
        creatorKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const instructions: TransactionInstruction[] = [];

      // Check if WSOL ATA exists
      const ataInfo = await program.provider.connection.getAccountInfo(creatorWSOLAccount);
      if (!ataInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          creatorKey,             // payer
          creatorWSOLAccount,     // ATA address
          creatorKey,             // owner
          WSOL_MINT               // WSOL mint
        );
        instructions.push(createAtaIx);
      }

      // (1) Transfer SOL to the WSOL ATA
      const transferIx = SystemProgram.transfer({
        fromPubkey: creatorKey,
        toPubkey: creatorWSOLAccount,
        lamports,
      });
      instructions.push(transferIx);

      // Sync native SOL to WSOL (critical!)
      const syncIx = createSyncNativeInstruction(
        creatorWSOLAccount,
        TOKEN_PROGRAM_ID
      );
      instructions.push(syncIx);

      // Add the actual addLiquidity instruction
      const ix: TransactionInstruction = await program.methods
        .addLiquidity(new anchor.BN(lamports))
        .accounts({
          creator: creatorKey,
          wsolMint:WSOL_MINT,
          creatorWsolAccount: creatorWSOLAccount,
          wsolLiquidityVault,
          vault_config: vaultConfig, 
          wsolVaultAuthority,
          mint: mintKey, // This is the custom token's mint
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      instructions.push(ix);

      const serializedInstructions = instructions.map((ix) => ({
          programId: ix.programId.toBase58(),
          keys: ix.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: ix.data.toString("base64"), // binary -> base64
        }));

      return reply.send({
        success: true,
        instructions: serializedInstructions,
      });
    } catch (err: any) {
      console.error('❌ Add liquidity failed:', err);
      return reply.status(500).send({ error: err.message || 'Unknown error' });
    }
  });

  
  server.post('/confirm', async (req, reply) => {
    const { mint } = req.body as { mint: string };

    if (!mint) {
      return reply.status(400).send({ error: "Missing mint address" });
    }

    try {
      const mintKey = new PublicKey(mint);
      const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

      const [wsolVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      // Small delay to ensure balance update
      await new Promise((res) => setTimeout(res, 500));

      // Get vault balances
      const wsolVaultInfo = await getAccount(program.provider.connection, wsolVault);
      const liquidityVaultInfo = await getAccount(program.provider.connection, liquidityVault);

      const wsolBalance = Number(wsolVaultInfo.amount) / anchor.web3.LAMPORTS_PER_SOL;
      const tokenBalance = Number(liquidityVaultInfo.amount);

      if (tokenBalance === 0) {
        return reply.status(400).send({ error: "Token balance is 0 in liquidity vault" });
      }

      const currentPrice = wsolBalance / tokenBalance;
      const marketCap = currentPrice * tokenBalance;
      const liquidity = wsolBalance;

      // Get SOL/USD price from Jupiter (v2 endpoint)
      const res = await axios.get('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112');
      const solUsd = res.data?.data?.['So11111111111111111111111111111111111111112']?.usdPrice || 0;

      const currentPriceUsd = currentPrice * solUsd;
      const marketCapUsd = marketCap * solUsd;
      const liquidityUsd = liquidity * solUsd;

      // Upsert TokenStats
      await prisma.tokenStats.upsert({
        where: { mint },
        update: {
          currentPrice,
          marketCap,
          liquidity,
          currentPriceUsd,
          marketCapUsd,
          liquidityUsd,
        },
        create: {
          mint,
          currentPrice,
          marketCap,
          liquidity,
          currentPriceUsd,
          marketCapUsd,
          liquidityUsd,
          volume24h: 0,
          buyCount24h: 0,
          sellCount24h: 0,
          buysToSells: 0,
          makers: 0,
          change5m: 0,
          change1h: 0,
          change6h: 0,
          change24h: 0,
        },
      });

      // Mark token as active
      const updated = await prisma.tokenLaunch.update({
        where: { mint },
        data: { status: 'active' },
      });

      return reply.send({ success: true, updated });
    } catch (err: any) {
      console.error('❌ Confirm Liquidity Update failed:', err);
      return reply.status(500).send({ error: err.message || 'Unknown error' });
    }
  });



};

export default addLiquidityRoute;
