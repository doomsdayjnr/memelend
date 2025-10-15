import redis  from '../../db/redis';
import { getSolUsdPrice } from '../price_routes/pricing';

async function updatePrice() {
  try {
    const price = await getSolUsdPrice();
    if (price > 0) {
      await redis.set('SOL_USD_PRICE', price.toString(), 'EX', 15);
      console.log(`✅ Updated SOL/USD price: ${price}`);
    }
  } catch (err) {
    console.error('❌ Failed to update SOL/USD price in Redis:', err);
  }
}

// Update every 60 seconds
setInterval(updatePrice, 60_000);
updatePrice(); // run immediately at start