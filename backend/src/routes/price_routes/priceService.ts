import redis  from '../../db/redis';
import { getSolUsdPrice } from '../price_routes/pricing';

export async function getCachedSolUsdPrice(): Promise<number> {
  const cached = await redis.get('SOL_USD_PRICE');
  if (cached) {
    return parseFloat(cached);
  }

  // If cache is missing, fetch & store immediately
  const price = await getSolUsdPrice();
  if (price > 0) {
    await redis.set('SOL_USD_PRICE', price.toString(), 'EX', 30);
  }
  return price;
}
