import { FastifyPluginAsync } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import program from '../../services/anchorClient';
import * as anchor from '@coral-xyz/anchor';
import prisma from '../../db/client';

interface VaultConfig {
  mint: PublicKey;
  tokenReserve: anchor.BN;
  solReserve: anchor.BN;
  accumulatedC: anchor.BN;
  virtualSol: anchor.BN;
  virtualTokens: anchor.BN;
  bump: number;
}

interface TokenConfig {
  creatorFeeBps: number;
  platformFeeBps: number;
  wsolLiquidityVault: PublicKey;
}

const sellPreviewRoute: FastifyPluginAsync = async (server) => {
  server.get('/sell-preview', async (req, reply) => {
    const { mint,  slippage, position_id, user } = req.query as {
      mint: string;
      slippage: number;
      position_id:number;
      user: string;
    };

    console.log("position_id", position_id.toString());

    if (!mint || !slippage) {
      return reply.send({
        success: false,
        claimable: 0,
        message: "Missing mint, tokenPercentage, slippage, or user in query"
      });
    }

    try {
      const mintKey = new PublicKey(mint);
      const userKey = new PublicKey(user);

      // PDAs for fetching data
      const [liquidityTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      const [vaultConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );

      const [tokenConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mintKey.toBuffer()],
        program.programId
      );

      const userTokenAccount = await PublicKey.findProgramAddressSync(
        [userKey.toBuffer(), anchor.utils.token.TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
        anchor.utils.token.ASSOCIATED_PROGRAM_ID
      );


      // Fetch all needed accounts
      const [userBalanceInfo, tokenVaultInfo, vaultConfigAccount, tokenConfigAccount] = await Promise.all([
        program.provider.connection.getTokenAccountBalance(userTokenAccount[0]),
        program.provider.connection.getTokenAccountBalance(liquidityTokenVault),
        (program.account as any).vaultConfig.fetch(vaultConfigPDA) as Promise<VaultConfig>,
        (program.account as any).tokenConfig.fetch(tokenConfigPDA) as Promise<TokenConfig>,
      ]);

      // Pull the exact position from DB
      const position = await prisma.position.findUnique({
        where: { 
          userWallet: user,
          positionId: BigInt(position_id),
          },  // since you declared positionId as BigInt
      });

      if (!position) {
        return reply.status(404).send({ error: 'Position not found' });
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
      const tokensOutDb = new anchor.BN(position.tokensOut?.toString() || "0");
      console.log("tokensOutDb", tokensOutDb.toString());
     
      if (tokensOutDb.isZero()) {
        return reply.send({
          success: false,
          claimable: 0,
          message: "Position has 0 tokensOut"
        });
      }

      const userBalanceRaw = new anchor.BN(userBalanceInfo.value.amount);
      console.log("userBalanceRaw", userBalanceRaw.toString());
     
      if (userBalanceRaw.lt(tokensOutDb)) {
        return reply.send({
          success: false,
          claimable: 0,
          message: "Insufficient token balance."
        });
      }

      // Final amount to sell = tokensOut from DB
      const tokenAmount = tokensOutDb;
      console.log("tokenAmount", tokenAmount.toString());

   
      // Convert to BN for calculations
      const tokenReserveBN = new anchor.BN(tokenVaultInfo.value.amount);
      const solReserveBN = new anchor.BN(vaultConfigAccount.solReserve.toString());
      const accumulatedCBN = new anchor.BN(vaultConfigAccount.accumulatedC.toString());
      const virtualSol = new anchor.BN(vaultConfigAccount.virtualSol.toString());
      const virtualTokens = new anchor.BN(vaultConfigAccount.virtualTokens.toString());
      console.log("tokenReserveBN", tokenReserveBN.toString());
      console.log("solReserveBN", solReserveBN.toString());
      console.log("accumulatedCBN", accumulatedCBN.toString());
      console.log("virtualSol", virtualSol.toString());
      console.log("virtualTokens", virtualTokens.toString());

      // Validate reserves
      if (tokenReserveBN.isZero() || solReserveBN.isZero()) {
        return reply.send({
          success: false,
          claimable: 0,
          message: "Insufficient liquidity in vaults"
        });
      }

      // Calculate gross SOL output (before fees)
      const effectiveY = solReserveBN.add(accumulatedCBN).add(virtualSol);
      const denominator = tokenReserveBN.add(virtualTokens).add(tokenAmount);
      const numerator = tokenAmount.mul(effectiveY);
      const grossSolOut = numerator.div(denominator);

      console.log("grossSolOut", grossSolOut.toString());

      // Calculate fees
      const creatorFee = grossSolOut
        .muln(tokenConfigAccount.creatorFeeBps)
        .divn(10_000);
      
      const platformFee = grossSolOut
        .muln(tokenConfigAccount.platformFeeBps)
        .divn(10_000);
      
      
      const netSolOut = grossSolOut.sub(creatorFee).sub(platformFee);
     

      // Apply slippage tolerance
      const minSolOut = netSolOut
        .muln(10_000 - slippage)
        .divn(10_000);
    
      
      console.log("minSolOut", minSolOut.toString());

      // Prepare response
      return reply.send({
        success: true,
        grossSolOut: grossSolOut.toString(),
        netSolOut: netSolOut.toString(),
        minSolOut: minSolOut.toString(),
        creatorFee: creatorFee.toString(),
        platformFee: platformFee.toString(),
        tokenAmount: tokenAmount.toString(),
        tokenReserve: tokenReserveBN.toString(),
        solReserve: solReserveBN.toString(),
        accumulatedC: accumulatedCBN.toString(),
        effectiveY: effectiveY.toString(),
        fees: {
          creatorBps: tokenConfigAccount.creatorFeeBps,
          platformBps: tokenConfigAccount.platformFeeBps,
          totalBps: tokenConfigAccount.creatorFeeBps + tokenConfigAccount.platformFeeBps
        }
      });
    } catch (error) {
      console.error('Sell preview error:', error);
      return reply.status(500).send({ success: false, claimable: 0, message: error});
    }
  });
};

export default sellPreviewRoute;