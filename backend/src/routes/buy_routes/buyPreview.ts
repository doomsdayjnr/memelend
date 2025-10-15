import { FastifyPluginAsync } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import program from '../../services/anchorClient';
import prisma from '../../db/client';
import * as anchor from '@coral-xyz/anchor';



const buyPreviewRoute: FastifyPluginAsync = async (server) => {
  server.get('/buy-preview', async (req, reply) => {
    const { mint, solAmount: solAmountRaw, user, slippage } = req.query as {
      mint: string;
      solAmount: string;
      user: string;
      slippage:number;
    };

    if (!mint || !solAmountRaw || !user) {
      return reply.send({
        success: true,
        claimable: 0,
        message: "Missing mint, solAmount or user in query"
      });
    }

    const solAmount = parseFloat(solAmountRaw);
    if (solAmount <= 0) {
      return reply.send({
        success: true,
        claimable: 0,
        message: "solAmount must be > 0"
      });
    }

    try {
      const mintKey = new PublicKey(mint);

      // PDAs as in your buyToken.ts
      const [liquidityTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      const [liquiditySolVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_wsol'), mintKey.toBuffer()],
        program.programId
      );

      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );

      // Fetch all needed accounts with proper typing
      const [tokenVaultInfo, vaultConfigAccount] = await Promise.all([
        program.provider.connection.getTokenAccountBalance(liquidityTokenVault),
        (program.account as any).vaultConfig.fetch(vaultConfig) as Promise<any>
      ]);


      if (!tokenVaultInfo) {
        return reply.send({
          success: true,
          claimable: 0,
          message: "Could not fetch vault balances"
        });
      }

      // Convert string balances to numbers
      const tokenReserveBN = new anchor.BN(tokenVaultInfo.value.amount); // token with 6 decimals
      const solReserveBN = new anchor.BN(vaultConfigAccount.solReserve.toString());
      const accumulatedC = new anchor.BN(vaultConfigAccount.accumulatedC.toString());
      const virtualSol = new anchor.BN(vaultConfigAccount.virtualSol.toString());
      const virtualTokens = new anchor.BN(vaultConfigAccount.virtualTokens.toString());
    
      if (tokenReserveBN.isZero() || solReserveBN.isZero()) {
        return reply.send({
          success: true,
          claimable: 0,
          message: "Insufficient liquidity in vaults"
        });
      }

      // Constants
      const TOKEN_DECIMALS = 6;

      const inputLamportsBN = new anchor.BN(Math.floor(solAmount * 1_000_000_000));

      // Fees: creator always 0.5%
      const creatorFeePercent = 0.005;

      // Find referral info from DB
      const dbUser = await prisma.user.findUnique({
        where: { wallet: user },
        include: { referredBy: true },
      });

      let referralFeePercent = 0;
      let platformFeePercent = 0;

      if (dbUser?.referredBy?.wallet && dbUser.referredBy.wallet !== user) {
        // Referral exists: split 3% between platform and referral
        referralFeePercent = 0.005;
        platformFeePercent = 0.005;
      } else {
        // No referral: platform takes full 1%
        referralFeePercent = 0;
        platformFeePercent = 0.01;
      }

      const totalFeePercent = creatorFeePercent + referralFeePercent + platformFeePercent;

      // Apply fee: effectiveInput = input * (1 - totalFee)
      const feeBps = Math.floor(totalFeePercent * 10_000); // e.g. 700 = 7%
      const effectiveInputBN = inputLamportsBN.muln(10_000 - feeBps).divn(10_000);

      // Effective SOL reserve (y + c)
      const effectiveSolReserveBN = solReserveBN.add(accumulatedC).add(virtualSol);
      const effectiveTokenReserveBN = tokenReserveBN.add(virtualTokens);
      // ---- Reinforced bonding curve formula ----
      // k = token_reserve * (sol_reserve + accumulated_c)
      // const k = tokenReserveBN.mul(effectiveSolReserveBN);

      // New effective SOL reserve after input
      // const newEffectiveSolReserveBN = effectiveSolReserveBN.add(effectiveInputBN);

      // New token reserve to maintain k
      // const newTokenReserveBN = k.div(newEffectiveSolReserveBN);

      // Tokens out
      const numerator = effectiveInputBN.mul(effectiveTokenReserveBN);
      const denominator = effectiveSolReserveBN.add(effectiveInputBN);
      const tokensOutBN = numerator.div(denominator);

      // Min tokens out (1% slippage default)
      const minTokensOutBN = tokensOutBN.muln(10_000 - slippage).divn(10_000);

      // Price calculation using effective y Matches Rust: (effective_sol_reserve * 10^decimals) / token_reserve
      const priceLamportsPerToken = effectiveSolReserveBN
        .mul(new anchor.BN(10 ** TOKEN_DECIMALS))
        .div(tokenReserveBN);
      
      // After calculating tokensOutBN
      const maxTokensAllowed = tokenReserveBN.divn(5);
      // console.log("Max allowed:", maxTokensAllowed.toString(), "Tokens out:", tokensOutBN.toString(), "Min Tokens Out:", minTokensOutBN.toString());

      if (tokensOutBN.gt(maxTokensAllowed)) {
        return reply.send({
            success: true,
            claimable: 0,
            message: `Cannot buy more than 20% of pool. Attempting to buy ${tokensOutBN.toString()} but max is ${maxTokensAllowed.toString()}`
          });
      }

      // Prepare response (all amounts as raw units)
      return reply.send({
        success: true,
        tokensOut: tokensOutBN.toString(),
        minTokensOut: minTokensOutBN.toString(),
        priceLamportsPerToken: priceLamportsPerToken.toString(),
        solAmount,
        tokenReserve: tokenReserveBN.toString(),
        solReserve: solReserveBN.toString(),
        accumulatedC: accumulatedC.toString(),
        effectiveInput: effectiveInputBN.toString(),
        fees: {
          totalFeePercent,
          creatorFeePercent,
          platformFeePercent,
          referralFeePercent,
          feeLamports: inputLamportsBN.sub(effectiveInputBN).toString(),
        },
      });
    } catch (error) {
      console.error('Buy preview error:', error);
      return reply.status(500).send({ success: false, claimable: 0, message: error });
    }
  });
};

export default buyPreviewRoute;