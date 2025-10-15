import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const getPriceRoute: FastifyPluginAsync = async (server) => {
  // GET /price?mints=abc,def,ghi
  server.get('/price', async (req, reply) => {
    const { mints } = req.query as { mints?: string };
    if (!mints) {
      return reply.status(400).send({ error: 'Missing mints query param' });
    }

    const mintList = mints.split(',').map((m) => m.trim());

    try {
      // Fetch vaults for all mints in one DB call
      const vaults = await prisma.yieldVault.findMany({
        where: { mint: { in: mintList } },
      });

      if (!vaults.length) {
        return reply.status(404).send({ error: 'No vaults found for provided mints' });
      }

      // Fetch SOL/USD price once
      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      const tokenDecimals = 6;
      const solDecimals = 9;

      const results = vaults.map((vault) => {
        const tokenReserveBN = BigInt(vault.tokenReserve.toString());
        const solReserveBN = BigInt(vault.solReserve.toString());
        const accumulatedCBN = BigInt(vault.accumulatedC.toString());
        const virtualSolBN = BigInt(vault.virtualSol.toString());
        const virtualTokensBN = BigInt(vault.virtualTokens.toString());

        if (tokenReserveBN === 0n || solReserveBN === 0n) {
          return {
            mint: vault.mint,
            error: 'Insufficient liquidity in vaults',
          };
        }

        const solReserveNormalized = Number(solReserveBN) / 10 ** solDecimals;
        const tokenReserveNormalized = Number(tokenReserveBN) / 10 ** tokenDecimals;
        const accumulatedCNormalized = Number(accumulatedCBN) / 10 ** solDecimals;
        const virtualSolNormalized = Number(virtualSolBN) / 10 ** solDecimals;
        const virtualTokensNormalized = Number(virtualTokensBN) / 10 ** tokenDecimals;

        
        const effectiveTokenReserve = tokenReserveNormalized + virtualTokensNormalized;
        
        const priceInSol =
          (solReserveNormalized + accumulatedCNormalized + virtualSolNormalized) / effectiveTokenReserve;


        const priceInUsd = priceInSol * solUsd;
        

        return {
          mint: vault.mint,
          priceInSol,
          priceInUsd,
          currentPriceUsd: priceInUsd,
          solUsd,
        };
      });

      return reply.send({ prices: results });
    } catch (err: any) {
      console.error('❌ Failed to fetch token prices:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

export default getPriceRoute;
