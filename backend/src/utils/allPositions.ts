import { PublicKey } from '@solana/web3.js';
import  prisma  from '../db/client'; // adjust to your prisma import
import { getCachedSolUsdPrice } from '../routes/price_routes/priceService';

export async function fetchOpenPositions(): Promise<any[]> {
  // 1. Pull all open short positions from DB
  const positions = await prisma.position.findMany({
    where: {
      isOpen: true,
      side: 'short', // only short positions
    },
  });

  // console.log("positions", positions);

  // 2. Get cached SOL → USD price
  const solUsd = await getCachedSolUsdPrice();

  // 3. Map DB rows into the format expected by the bot
  return positions.map((pos) => {
    try {
      // Normalize values
      const entryPrice = pos.entryPrice; // already USD float from DB
      const liquidationPriceUsd = pos.liquidationPrice
        ? Number(pos.liquidationPrice) / 1_000_000_000
        : null;

      // console.log("entryPrice", entryPrice);
      // console.log("liquidationPriceUsd", liquidationPriceUsd);

      return {
        pubkey: new PublicKey(pos.mint), // no on-chain PDA, use mint as identifier
        account: {
          owner: new PublicKey(pos.userWallet),
          mint: new PublicKey(pos.mint),
          entry_price: entryPrice,
          liquidate: liquidationPriceUsd,
          borrowed_tokens: pos.borrowed ?? 0n,
          reserved_collateral: pos.collateral ?? 0n,
          position_id: pos.positionId,
          open: pos.isOpen,
          created_at: Math.floor(pos.openedAt.getTime() / 1000), // convert to unix seconds
        },
        user: pos.userWallet,
        mint: pos.mint,
        entryPrice: entryPrice,
        liquidate: liquidationPriceUsd,
        borrowedTokens: pos.borrowed ?? 0n,
        reservedCollateral: pos.collateral ?? 0n,
        positionId: pos.positionId,
        createdAt: Math.floor(pos.openedAt.getTime() / 1000),
      };
    } catch (err) {
      console.error('Failed to format position from DB:', err);
      return null;
    }
  }).filter(Boolean);
}
