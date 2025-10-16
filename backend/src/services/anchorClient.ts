import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';
import idlJson from '../../target/idl/memelend.json';
import dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config();

const connection = new Connection(process.env.RPC_URL!);
const secretKey = bs58.decode(process.env.CREATOR_KEY!);
const wallet = new Wallet(Keypair.fromSecretKey(secretKey));
const provider = new AnchorProvider(connection, wallet, {});
anchor.setProvider(provider);

const programId = new anchor.web3.PublicKey(process.env.PROGRAM_ID!);

const program = new Program(idlJson as any, provider);

export default program;