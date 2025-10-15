import { FastifyPluginAsync } from 'fastify';
import { PublicKey, Connection } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import program from '../../services/anchorClient';

interface Position {
  owner: PublicKey;
  collateral: anchor.BN;
  amount: anchor.BN;
  entryPrice: anchor.BN;
  mint: PublicKey;
  positionId: anchor.BN;
}

interface VaultConfig {
  tokenReserve: anchor.BN;
  solReserve: anchor.BN;
  accumulatedC: anchor.BN;
  virtualSol: anchor.BN;
  virtualTokens: anchor.BN;
  platformFeeBps: anchor.BN;
  creatorFeeBps: anchor.BN;
  referralFeeVault: PublicKey;
  platformFeeVault: PublicKey;
}

const closeShortPreviewRoute: FastifyPluginAsync = async (server) => {
  server.get('/close-preview', async (req, reply) => {
    const { position_id, user, mint, slippage } = req.query as {
      position_id: string;
      user: string;
      mint: string;
      slippage: string;
    };

    if (!position_id || !user || !mint) {
      return reply.send({
        success: false,
        claimable: 0,
        message: "Missing position ID, User, or Mint in query parameters"
      });
    }

    try {
      const userKey = new PublicKey(user);
      const mintKey = new PublicKey(mint);
      const positionId = new anchor.BN(position_id);
      const slippageBps = parseInt(slippage) || 50;

    //   // Derive position address
      const [positionAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('position'),
          userKey.toBuffer(),
          mintKey.toBuffer(),
          positionId.toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );

      // Derive vault config address
      const [vaultConfigAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_config'), mintKey.toBuffer()],
        program.programId
      );

      // Fetch accounts
      const position = await (program.account as any).position.fetch(positionAddress) as Position;
      const vaultConfig = await (program.account as any).vaultConfig.fetch(vaultConfigAddress) as VaultConfig;

      // Calculate current price
      const effectiveSolReserve = vaultConfig.solReserve.add(vaultConfig.accumulatedC).add(vaultConfig.virtualSol); 
      const effectiveTokenReserve = vaultConfig.tokenReserve.add(vaultConfig.virtualTokens);
      const currentPrice = effectiveSolReserve
        .mul(new anchor.BN(10 ** 6))
        .div(effectiveTokenReserve);

      // Calculate value at entry and current value
      const valueEntry = position.amount
        .mul(position.entryPrice)
        .div(new anchor.BN(10 ** 6));
      
      const valueNow = position.amount
        .mul(currentPrice)
        .div(new anchor.BN(10 ** 6));

      // Calculate PnL and adjusted collateral
      const pnl = valueEntry.sub(valueNow);
      let adjustedCollateral = new anchor.BN(position.collateral).add(pnl);
      if (adjustedCollateral.isNeg()) {
        adjustedCollateral = new anchor.BN(0);
      }

      // Calculate min token repayment with slippage
      const minTokenAmountToRepay = position.amount
        .mul(new anchor.BN(10000 - slippageBps))
        .div(new anchor.BN(10000));

      return reply.send({
        success: true,
        pnl: pnl.toString(),
        currentPrice: currentPrice.toString(),
        borrowedTokens: position.amount.toString(),
        minTokenAmountToRepay: minTokenAmountToRepay.toString(),
        entryPrice: position.entryPrice.toString(),
        originalCollateral: position.collateral.toString(),
        adjustedCollateral: adjustedCollateral.toString(),
        positionId: positionId.toString(),
      });
    } catch (error) {
      console.error('Close preview error:', error);
      return reply.status(500).send({ success: false, claimable: 0, message: error });
    }
  });
};

export default closeShortPreviewRoute;