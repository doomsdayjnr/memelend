import axios from 'axios';

export async function getSolUsdPrice(): Promise<number> {
  try {
    const res = await axios.get(
      'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112'
    );
    const solPrice = res.data?.['So11111111111111111111111111111111111111112']?.usdPrice;
    
    if (!solPrice) {
      throw new Error('SOL price missing from response');
    }

    return solPrice;
  } catch (err) {
    console.error('❌ Failed to fetch SOL/USD price:', err);
    return 0;
  }
}