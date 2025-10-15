import { FastifyPluginAsync } from 'fastify';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import program from '../../services/anchorClient';
import * as anchor from '@coral-xyz/anchor';


const joinPresalePreviewRoute: FastifyPluginAsync = async (server) => {
  server.get('/join-presale-preview', async (req, reply) => {
    const { user, mint, amount: amountRaw, slippage } = req.query as {
      user: string;
      mint: string;
      amount: string;
      slippage: number;
    };


    if (!mint || !amountRaw) {
      return reply.send({
        success: false,
        minTokensOut: 0,
        message: "Missing mint or amount in query."
      });
    }

    const amount = parseFloat(amountRaw);
    
    if (amount <= 0) {
      return reply.send({
        success: true,
        claimable: 0,
        message: "Not enough SOL to make transaction."
      });
    }

    if (amount > 3) {
      return reply.send({
        success: true,
        claimable: 0,
        message: "Max 3 SOL per transaction."
      });
    }

    try {
      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);

      // Derive tokenConfig PDA
      const [tokenConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('config'), mintKey.toBuffer()],
        program.programId
      );

      const [userPresalePosition] = PublicKey.findProgramAddressSync([
        Buffer.from("user_presale_position"),
        userKey.toBuffer(),
        mintKey.toBuffer(),
      ], program.programId);

      const [vaultConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );

      const [liquidityTokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_liquidity'), mintKey.toBuffer()],
        program.programId
      );

      // === 💡 Check if user has already joined presale ===
      const accountInfo = await program.provider.connection.getAccountInfo(userPresalePosition);
      if (accountInfo) {
        // Account already exists => user already participated
        return reply.send({
          success: false,
          claimable: 0,
          alreadyJoined: true,
          message: "You have already participated in this presale."
        });
      }


      // Fetch on-chain config
      const tokenConfigAccount: any = await (program.account as any).tokenConfig.fetch(tokenConfigPda);
      const [tokenVaultInfo, vaultConfigAccount] = await Promise.all([
        program.provider.connection.getTokenAccountBalance(liquidityTokenVault),
        (program.account as any).vaultConfig.fetch(vaultConfig) as Promise<any>
      ]);

      const presaleAllocation = Number(tokenConfigAccount.preSaleTokenAllocation ?? tokenConfigAccount.pre_sale_token_allocation ?? 0);

      // Convert string balances to numbers
      const tokenReserveBN = new anchor.BN(tokenVaultInfo.value.amount); // token with 6 decimals
      const solReserveBN = new anchor.BN(vaultConfigAccount.solReserve.toString());
      const accumulatedC = new anchor.BN(vaultConfigAccount.accumulatedC.toString());
      const virtualSol = new anchor.BN(vaultConfigAccount.virtualSol.toString());
      const virtualTokens = new anchor.BN(vaultConfigAccount.virtualTokens.toString());
    
      if (tokenReserveBN.isZero()) {
        return reply.send({
          success: true,
          claimable: 0,
          message: "Insufficient liquidity in vaults"
        });
      }

      const TOKEN_DECIMALS = 6;
      
      const inputLamportsBN = new anchor.BN(Math.floor(amount * 1_000_000_000));

      // === Apply the same 2% fee deduction used on-chain ===
      const automationFeeBps = 100; // 1%
      const effectiveInputBN = inputLamportsBN.muln(10_000 - automationFeeBps).divn(10_000);

      // Effective SOL reserve (y + c)
      const effectiveSolReserveBN = solReserveBN.add(accumulatedC).add(virtualSol);
      const effectiveTokenReserveBN = tokenReserveBN.add(virtualTokens);

      const numerator = effectiveInputBN.mul(effectiveTokenReserveBN);
      const denominator = effectiveSolReserveBN.add(effectiveInputBN);
      const tokensOutBN = numerator.div(denominator);

      // Check presale allocation
      if (tokensOutBN.gt(new anchor.BN(presaleAllocation))) {
        return reply.send({
          success: false,
          claimable: 0,
          message: "Purchase exceeds remaining presale allocation."
        });
      }

      // Slippage calculation (default to 1% if not specified)
      const minTokensOutBN = tokensOutBN.muln(10_000 - slippage).divn(10_000);

      return reply.send({
        success: true,
        tokensOut: tokensOutBN.toString(),
        minTokensOut: minTokensOutBN.toString(),
        amount,
      });

    } catch (err) {
      console.error('Presale preview error:', err);
      return reply.status(500).send({
        success: false,
        claimable: 0,
        message: 'Failed to preview presale, Please try again.'
      });
    }
  });
};

export default joinPresalePreviewRoute;
