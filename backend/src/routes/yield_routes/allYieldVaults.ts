import { FastifyPluginAsync } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import program from '../../services/anchorClient';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';

const yieldVaultRoute: FastifyPluginAsync = async (server) => {
  server.get('/yield-vault', async (req, reply) => {

    try {
      const yieldVaults = await program.provider.connection.getProgramAccounts(
        program.programId,
        {
          filters: [
                { dataSize: 117 } // YieldVault size
            ]
        }
      );
      

      const decodedYieldVaults = yieldVaults.map(({ pubkey, account }) => {
        const yieldVault = program.coder.accounts.decode('yieldVault', account.data);
        
        
        return {
          mint: yieldVault.mint.toBase58(),
          totalStaked: yieldVault.totalStaked.toNumber(),
          accRewardPerShare: yieldVault.accRewardPerShare.toNumber(),
          lastAccrualTs: yieldVault.lastAccrualTs.toNumber(),
        };
      });

      reply.send(decodedYieldVaults);
    } catch (err) {
      console.error('Failed to fetch yield positions:', err);
      reply.status(500).send({ error: 'Failed to fetch positions' });
    }
  });
};

export default yieldVaultRoute;
