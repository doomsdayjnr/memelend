import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import program from '../services/anchorClient';
import { fetchOpenPresales } from '../utils/allPresaleOpenTokens';
import prisma from '../db/client';

export const BOT_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf-8')
    )
  )
);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function ensureAtaExists(
  program: anchor.Program,
  mint: PublicKey,
  owner: PublicKey
): Promise<{
  ata: PublicKey;
  preInstruction?: anchor.web3.TransactionInstruction;
}> {
  const ata = await anchor.utils.token.associatedAddress({ mint, owner });
  try {
    await getAccount(program.provider.connection, ata);
    return { ata };
  } catch {
    const ix = createAssociatedTokenAccountInstruction(
      BOT_KEYPAIR.publicKey,
      ata,
      owner,
      mint
    );
    return { ata, preInstruction: ix };
  }
}

async function buildPdas(mintKey: PublicKey, owner: PublicKey) {
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config'), mintKey.toBuffer()],
    program.programId
  );
  const [tokenConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('config'), mintKey.toBuffer()],
    program.programId
  );
  const [yieldVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('yield_vault'), mintKey.toBuffer()],
    program.programId
  );
  const [userYieldPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_yield'), mintKey.toBuffer(), owner.toBuffer() ],
    program.programId
  );

  return {
    vaultConfig,
    tokenConfig,
    yieldVault,
    userYieldPosition,
  };
}

async function activatePresaleOnChain(mintKey: PublicKey, owner: PublicKey) {
  const { vaultConfig, tokenConfig, yieldVault, userYieldPosition } =
    await buildPdas(mintKey, owner);

  const wsolMint = new PublicKey(process.env.WSOL_MINT!);
  const { ata: botWsolAta, preInstruction } = await ensureAtaExists(
    program,
    wsolMint,
    BOT_KEYPAIR.publicKey
  );

  const ix = await program.methods
    .activatePresale() // your Anchor instruction
    .accounts({
      bot: BOT_KEYPAIR.publicKey,
      mint: mintKey,
      owner,
      tokenConfig,
      vaultConfig,
      botWsolAccount: botWsolAta,
      yieldVault,
      userYieldPosition,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction();
  if (preInstruction) tx.add(preInstruction);
  tx.add(ix);
  tx.feePayer = BOT_KEYPAIR.publicKey;

  const sig = await sendAndConfirmTransaction(
    program.provider.connection,
    tx,
    [BOT_KEYPAIR],
    { commitment: 'confirmed' }
  );
  console.log(`✅ Presale activated for ${mintKey.toBase58()} | tx: ${sig}`);
  return sig;
}

export async function startOnChainPresaleActivationBot() {
  console.log('🤖 Presale Activation Bot Started...');

  while (true) {
    try {
      const openPresales = await fetchOpenPresales();
      console.log('openPresales', openPresales);
      const now = new Date();

      for (const token of openPresales) {
        const mintKey = new PublicKey(token.mint);
        const owner = new PublicKey(token.creator);
        const presaleEnd = token.presaleEnd ? new Date(token.presaleEnd) : null;
        const presaleSol = token.presaleSol ? BigInt(token.presaleSol) : 0n;

        if (!presaleEnd) {
          console.warn(`⚠️ No presaleEnd set for ${token.name}, skipping.`);
          continue;
        }

        // 1️⃣ Check if presale ended
        if (presaleEnd <= now) {
          if (presaleSol > 0n) {
            // ✅ Presale had participants — activate token on-chain
            console.log(`🚀 Presale ended for ${token.name}, activating on-chain...`);
            try {
              await activatePresaleOnChain(mintKey, owner);

              console.log(`✅ ${token.name} marked as active`);
            } catch (err) {
              console.error(`❌ Failed to activate presale for ${token.name}:`, err);
            }
          } else {
            // ⚠️ Presale ended but no SOL raised — disable presale quietly
            console.log(`⛔ Presale for ${token.name} ended with 0 SOL — disabling presale.`);
            await prisma.tokenLaunch.update({
              where: { mint: token.mint },
              data: {
                isPresale: false,
                status: 'failed', 
              },
            });
          }
        } 
      }
    } catch (err) {
      console.error('Bot error:', err);
    }

    await sleep(15_000); // check every 15 seconds
  }
}


if (require.main === module) {
  startOnChainPresaleActivationBot().catch((e) => {
    console.error('Fatal bot error:', e);
    process.exit(1);
  });
}
