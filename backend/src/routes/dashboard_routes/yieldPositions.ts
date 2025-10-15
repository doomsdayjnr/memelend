import { FastifyPluginAsync } from 'fastify'; 
import { PublicKey } from '@solana/web3.js';
import prisma from '../../db/client';
import { getCachedSolUsdPrice } from '../price_routes/priceService';

const yieldUserPositionsRoute: FastifyPluginAsync = async (server) => {
  server.get('/yield-positions/:user', async (req, reply) => {
    const { user } = req.params as { user: string };

    try {
      let userPubkey: PublicKey;
      try {
        userPubkey = new PublicKey(user);
      } catch {
        return reply.status(400).send({ error: 'Invalid public key format' });
      }

      // --- Fetch user's open yield positions ---
      const yieldPositions = await prisma.yieldPosition.findMany({
        where: { userWallet: user, isOpen: true },
        orderBy: { openedAt: 'desc' },
      });

      const mints = yieldPositions.map((pos) => pos.mint);

      // --- Fetch userYieldPositions, yieldVaults, and tokenLaunch info in parallel ---
      const [userYieldPositions, yieldVaults, tokenLaunches] = await Promise.all([
        prisma.userYieldPosition.findMany({ where: { owner: user, mint: { in: mints } } }),
        prisma.yieldVault.findMany({ where: { mint: { in: mints } } }),
        prisma.tokenLaunch.findMany({
          where: { mint: { in: mints } },
          select: {
            mint: true,
            name: true,
            symbol: true,
            image: true,
            decimals: true,
            twitter: true,
            telegram: true,
            discord: true,
            website: true,
          },
        }),
      ]);

      // --- Index userYieldPositions, yieldVaults, and tokenLaunch by mint ---
      const userYieldMap = userYieldPositions.reduce((acc, u) => {
        acc[u.mint] = u;
        return acc;
      }, {} as Record<string, typeof userYieldPositions[0]>);

      const vaultMap = yieldVaults.reduce((acc, v) => {
        acc[v.mint] = v;
        return acc;
      }, {} as Record<string, typeof yieldVaults[0]>);

      const tokenMap = tokenLaunches.reduce((acc, t) => {
        acc[t.mint] = t;
        return acc;
      }, {} as Record<string, typeof tokenLaunches[0]>);

      // --- 2. Fetch SOL/USD price ---
      const solUsd = await getCachedSolUsdPrice();
      if (solUsd === 0) {
        console.warn('❌ SOL price is 0');
        return reply.status(502).send({ error: 'Failed to fetch SOL/USD price' });
      }

      const PRECISION = 1_000_000_000_000n; // for reward per share calculation

      // --- Merge all data and calculate pendingRewards ---
      const enrichedPositions = yieldPositions.map((pos) => {
        const userYield = userYieldMap[pos.mint];
        const vault = vaultMap[pos.mint];

        let pendingRewards = 0n;
        if (userYield && vault) {
          pendingRewards =
            (BigInt(userYield.deposited) * BigInt(vault.accRewardPerShare)) / PRECISION -
            BigInt(userYield.rewardDebt);
        }
        
        const mintDecimals = 6;
        const pendingTokens = Number(pendingRewards) / 1e9 / 10 ** mintDecimals;
        const pendingUsd = pendingTokens * solUsd;
        
        return {
          publicKey: userPubkey.toBase58(),
          mint: pos.mint,
          positionId: pos.positionId.toString(),
          isCreator: pos.isCreator,
          deposited: Number(pos.deposited),
          openedAt: pos.openedAt,
          pendingRewards: pendingUsd,
          userYieldPosition: userYield
            ? {
                claimedPrincipal: Number(userYield.claimedPrincipal),
                initialDeposit: Number(userYield.initialDeposit),
                deposited: Number(userYield.deposited),
                rewardDebt: Number(userYield.rewardDebt),
                claimedTotal: Number(userYield.claimedTotal),
                depositedAt: Number(userYield.depositedAt),
                lastActionTs: Number(userYield.lastActionTs),
                isCreator: userYield.isCreator,
              }
            : null,
          yieldVault: vault
            ? {
                totalStaked: Number(vault.totalStaked),
                accRewardPerShare: Number(vault.accRewardPerShare),
                aprBps: Number(vault.aprBps),
                launchTs: Number(vault.launchTs),
                maxWithdrawBps: Number(vault.maxWithdrawBps),
                lastAccrualTs: Number(vault.lastAccrualTs),
              }
            : null,
          token: tokenMap[pos.mint] ?? null,
        };
      });

      reply.send(enrichedPositions);

    } catch (err) {
      console.error('Failed to fetch yield positions:', err);
      reply.status(500).send({ error: 'Failed to fetch positions' });
    }
  });
};

export default yieldUserPositionsRoute;
