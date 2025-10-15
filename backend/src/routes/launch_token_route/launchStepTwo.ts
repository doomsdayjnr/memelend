import { FastifyPluginAsync } from 'fastify';
import { PublicKey, TransactionInstruction, Connection, clusterApiUrl, Transaction} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import dotenv from 'dotenv';
import axios from 'axios';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';


dotenv.config();

type MetadataInput = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
};

const launchStepTwoRoutes: FastifyPluginAsync = async (server) => {
  server.post('/prepare-step2', {
    handler: async (req, reply) => {
      const { creator, tokenId } = req.body as {
        creator: string;
        tokenId: string;
      };

      const creatorFeeBps = 50;

      try {
        const creatorKey = new PublicKey(creator);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

        const [mintPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('mint'), creatorKey.toBuffer(), Buffer.from(tokenId)],
          program.programId
        );
        const [vaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault'), mintPda.toBuffer()],
          program.programId
        );
        const [tokenConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('config'), mintPda.toBuffer()],
          program.programId
        );
        const [wsolVault] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_wsol"), mintPda.toBuffer()],
          program.programId
        );
        const [wsolVaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_wsol_authority"), mintPda.toBuffer()],
          program.programId
        );

        const [projectVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_project'), mintPda.toBuffer()],
          program.programId
        );
        const [platformVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_platform'), mintPda.toBuffer()],
          program.programId
        );
        const [vaultConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_config'), mintPda.toBuffer()],
          program.programId
        );

        const [liquidityVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_liquidity'), mintPda.toBuffer()],
          program.programId
        );
          
        const instructions: TransactionInstruction[] = [];

        const ix = await program.methods
          .initializeFeeVaults(creatorFeeBps)
          .accounts({
            creator: creatorKey,
            mint: mintPda,
            tokenConfig,
            wsolMint: WSOL_MINT,
            projectVault:projectVault,
            platformVault:platformVault,
            wsolLiquidityVault: wsolVault,
            liquidity_vault: liquidityVault,
            wsolVaultAuthority,
            vaultAuthority,
            vaultConfig,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
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
          wsolLiquidityVault:wsolVault,
          instructions: serializedInstructions,
        });
      } catch (err: any) {
        console.error('❌ Prepare Step 2 failed:', err);
        reply.status(500).send({ success: false, claimable: 0, message: err.message });
      }
    },
  });

  server.post('/save', {
    handler: async (req, reply) => {
      const { 
        creator, mint, name, symbol, uri, image, 
        twitter, telegram, discord, website, launchTxSignature, 
        lendPercent, presalePercent, isPresale, lendAmount, presaleAmount, liquidityAmount, lendingVault, liquidityVault, wsolVault, tokenId,
        presaleStart, presaleEnd,
        subCategories, // ✅ expect an array of subcategory IDs
      } = req.body as MetadataInput & {
        creator: string;
        mint: string;
        uri: string;
        launchTxSignature?: string;
        lendPercent: number;
        presalePercent: number;
        isPresale: boolean;
        lendAmount: string;
        presaleAmount: string;
        liquidityAmount: string;
        lendingVault: string;
        liquidityVault: string;
        wsolVault: string;
        tokenId: string;
        presaleStart?: string;
        presaleEnd?: string;
        subCategories?: number[];
      };

      try {
        const launch = await prisma.tokenLaunch.create({
          data: {
            creator,
            mint,
            tokenId,
            name,
            symbol,
            uri,
            image,
            twitter,
            telegram,
            discord,
            website,
            isPresale,
            presalePercent,
            presaleAmount,
            presaleAmountLeftOver:presaleAmount,
            status: 'pending',
            launchTxSignature,
            lendPercent,
            lendAmount,
            liquidityAmount,
            lendingVault,
            liquidityVault,
            wsolVault,
            presaleStart: presaleStart ? new Date(presaleStart) : null,
            presaleEnd: presaleEnd ? new Date(presaleEnd) : null,
            // ✅ create links in the join table
            categories: subCategories && subCategories.length > 0
              ? {
                  create: subCategories.map((id) => ({
                    subCategory: { connect: { id } },
                  })),
                }
              : undefined,
          },
          include: {
            categories: { include: { subCategory: true } }, // return with categories
          },
        });

        return reply.send({ success: true, mint, launch });
      } catch (err: any) {
        console.error('❌ Save failed:', err);
        return reply.status(500).send({ error: err.message || 'Unknown error' });
      }
    },
  });
};

export default launchStepTwoRoutes;
