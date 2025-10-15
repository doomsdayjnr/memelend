import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { PublicKey, TransactionInstruction, Connection, clusterApiUrl, Transaction} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import dotenv from 'dotenv';
import axios from 'axios';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import { randomUUID } from 'crypto';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import pinataSDK from '@pinata/sdk';

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


function generateMetadataJson(input: MetadataInput) {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    external_url: input.website,
    attributes: [],
    properties: {
      files: [{ uri: input.image, type: 'image/png' }],
      category: 'image',
    },
    extensions: {
      twitter: input.twitter,
      telegram: input.telegram,
      discord: input.discord,
    },
  };
}

async function uploadMetadataToPinata(metadata: MetadataInput): Promise<string> {
  const json = generateMetadataJson(metadata);
  const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

  const response = await axios.post(url, json, {
    headers: {
      pinata_api_key: process.env.PINATA_API_KEY!,
      pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY!,
    },
  });

  return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
}
const pinata = new pinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY!,
  pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY!,
});


const launchStepOneRoutes: FastifyPluginAsync = async (server) => {
  server.post('/upload-image', async (req: FastifyRequest, reply: FastifyReply) => {
    
    const part = await req.file(); 

    if (!part || !part.filename) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!part.mimetype?.startsWith('image/')) {
      return reply.status(400).send({ error: 'Invalid file type' });
    }

    const tempDir = path.join(__dirname, '..', '..', 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const filePath = path.join(tempDir, part.filename);
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(part.file, writeStream);

    const readable = fs.createReadStream(filePath);
    const result = await pinata.pinFileToIPFS(readable, {
      pinataMetadata: { name: part.filename },
    });

    fs.unlinkSync(filePath);

    const imageUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
    return reply.send({ imageUrl });
  });

  server.post('/prepare', {
    handler: async (req, reply) => {
      const {
        creator,
        symbol,
        lendPercent,
        presalePercent,
        name,
        description,
        image,
        website,
        twitter,
        telegram,
        discord,
      } = req.body as {
        creator: string;
        symbol: string;
        lendPercent: number;
        presalePercent: number;
      } & MetadataInput;

        if (lendPercent > 40) {
            return reply.send({
                success: false,
                claimable: 0,
                message: "Allocated percentage too high. Max allowed is 40% to prevent rug behavior."
            });
        }

        if (presalePercent > 15) {
            return reply.send({
                success: false,
                claimable: 0,
                message: "Allocated percentage too high. Max allowed is 15% to prevent rug behavior."
            });
        }

        if (!name || !symbol || !image || !description) {
            return reply.send({
                success: false,
                claimable: 0,
                message: "Missing required metadata fields."
            });
        }

      const token_id = `token-${Date.now()}-${randomUUID().slice(0, 6)}`;

      try {
        const uri = await uploadMetadataToPinata({
          name,
          symbol,
          description,
          image,
          website,
          twitter,
          telegram,
          discord,
        });

        const creatorKey = new PublicKey(creator);
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
        const position_id = Date.now() + Math.floor(Math.random() * 1000);

        const [mintPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('mint'), creatorKey.toBuffer(), Buffer.from(token_id)],
          program.programId
        );
        const [mintAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('mint_authority'), creatorKey.toBuffer(), Buffer.from(token_id)],
          program.programId
        );
        const [tokenVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_token'), mintPda.toBuffer()],
          program.programId
        );
        const [tokenVaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_token_authority'), mintPda.toBuffer()],
          program.programId
        );
        const [lendingVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_lending'), mintPda.toBuffer()],
          program.programId
        );
        const [lendingVaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_lending_authority'), mintPda.toBuffer()],
          program.programId
        );
        const [liquidityVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_liquidity'), mintPda.toBuffer()],
          program.programId
        );
        const [liquidityVaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_liquidity_authority'), mintPda.toBuffer()],
          program.programId
        );
        const [vaultAuthority] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault'), mintPda.toBuffer()],
          program.programId
        );
        const [yieldVault] = PublicKey.findProgramAddressSync(
          [Buffer.from("yield_vault"), mintPda.toBuffer()],
          program.programId
        );
        const [userYieldPosition] = PublicKey.findProgramAddressSync(
          [Buffer.from("user_yield"), mintPda.toBuffer(), creatorKey.toBuffer()],
          program.programId
        );
        const [tokenConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from('config'), mintPda.toBuffer()],
          program.programId
        );

        const instructions: TransactionInstruction[] = [];

        const ix = await program.methods
          .initializeTokenAndSplitSupply(token_id, symbol, new anchor.BN(1_000_000_000_000_000), lendPercent, new anchor.BN(position_id), presalePercent)
          .accounts({
            creator: creatorKey,
            mint: mintPda,
            mintAuthority,
            tokenVault,
            tokenVaultAuthority,
            lendingVault,
            lendingVaultAuthority,
            liquidityVault,
            liquidityVaultAuthority,
            vaultAuthority,
            yieldVault,
            userYieldPosition,
            tokenConfig,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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
            mintAddress: mintPda.toBase58(),
            lendingAddress: lendingVault.toBase58(),
            liquidityAddress: liquidityVault.toBase58(),
            tokenId: token_id,
            uri,
            instructions: serializedInstructions, // array of JSON instructions
          });
      } catch (err: any) {
        console.error('❌ Prepare launch failed:', err);
        reply.status(500).send({ success: false, claimable: 0, message: err.message });
      }
    },
  });

};

export default launchStepOneRoutes;
