import { useState, useEffect, type JSX, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import { useToast } from "../alerts/ToastContainer";

function ShortPreview({ mint, collateral, slippage, collateralPercent }: any) {
      const [loading, setLoading] = useState(false);
      const [previewLoading, setPreviewLoading] = useState(false);
      const [previewData, setPreviewData] = useState<any>(null);
      const { connection } = useConnection();
      const { publicKey, signTransaction } = useWallet();
      const { showToast } = useToast();
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    const handlePreview = useCallback(async () => {
        if (!publicKey) {
          showToast('❌ Please connect your wallet', 'error');
          return;
        }
    
    
        if (collateralPercent > 50) {
          showToast("❌ Collateral percentage cannot exceed 50%", 'error');
          return;
        }
    
        const solAmount = parseFloat(collateral);
        if (isNaN(solAmount) || solAmount <= 0) {
          setPreviewData(null);
          return;
        }
    
        try {
          setPreviewLoading(true);
    
          const lamports = solAmount * 1_000_000_000;
          const slippageBps = Math.floor(slippage * 100);
    
          const res = await axios.get(`${apiBase}/token/short-pre-preview`, {
            params: {
              mint,
              collateralAmount: lamports,
              collateralPercent,
              user: publicKey.toBase58(),
              slippage: slippageBps,
            }
          });
    
          const data = res.data;
    
          if (!data.success || data.claimable === 0) {
            setPreviewData(null);
            showToast(data.message, 'error');
            setLoading(false);
            return;
          }
    
          const borrowedTokens = Number(res.data.tokensOut) / 1e6;
          const entryPriceUSD = Number(res.data.priceInUsd);
          const entryPriceSOL = Number(res.data.priceInSol);
          const borrowPct = collateralPercent / 100;
          const liquidationPriceSOL = entryPriceSOL * ((1 - borrowPct) / borrowPct);
          const solUsd = Number(res.data.solUsd);
          const liquidationPriceUSD = liquidationPriceSOL * solUsd;
          const gapUSD = liquidationPriceUSD - entryPriceUSD;
    
          setPreviewData({
            borrowedTokens,
            entryPrice: entryPriceUSD,
            liquidationPrice: liquidationPriceUSD,
            gap: gapUSD
          });
        } catch (err) {
          console.error(err);
          showToast('❌ Failed to fetch preview', 'error');
        } finally {
          setPreviewLoading(false);
        }
      }, [publicKey, collateral, collateralPercent, slippage, mint, apiBase]);

      useEffect(() => {
        const timer = setTimeout(() => {
        if (publicKey && collateral && parseFloat(collateral) > 0) {
            handlePreview();
        } else {
            setPreviewData(null);
        }
        }, 500);

        return () => clearTimeout(timer);
    }, [handlePreview]);

    const formatTinyUSD = (value: number | null | undefined): JSX.Element | string => {
        if (value == null || !isFinite(value)) {
            return "$0.00"; // fallback when value is missing, null, or Infinity
        }

        if (value >= 0.01) {
            return `$${value.toFixed(8)}`;
        }

        const str = value.toString();
        const decimalPart = str.split('.')[1] || '';
        const match = decimalPart.match(/^(0*)(\d+)/);
        if (!match) return `$${value.toFixed(8)}`;

        const zeroCount = match[1].length;
        const significantDigits = match[2].slice(0, 6);

        return (
            <span className="tiny-usd">
            $0.0<sup>{zeroCount}</sup>
            {significantDigits}
            </span>
        );
    };

  return (
    <div>
        {previewLoading ? (
        <div className="preview-results">
          <p>Loading preview...</p>
        </div>
      ) : previewData && (
        <>
        <div className='token-core-information-fields'>
            <div className='token-core-items-one'>
                <div className='label'>
                    Short Estimated Preview
                </div>
            </div>
        </div>
        {previewData.borrowedTokens !== null && (
        <div className='token-core-information-fields'>
            <div className='token-core-items-one'>
                <div className='label'>
                    Borrowed Tokens
                </div>
            </div>
            <div className='token-core-items-one'>
                <div className='content'>
                    {previewData.borrowedTokens.toFixed(2)}
                </div>
            </div>
        </div>
        )}
        {previewData.entryPrice !== null && (
        <div className='token-core-information-fields'>
            <div className='token-core-items-one'>
                <div className='label'>
                    Open Price
                </div>
            </div>
            <div className='token-core-items-one'>
                <div className='content'>
                    {formatTinyUSD(previewData.entryPrice.toFixed(10))}
                </div>
            </div>
        </div>
        )}
        {previewData.liquidationPrice !== null && (
        <div className='token-core-information-fields'>
            <div className='token-core-items-one'>
                <div className='label'>
                    Liquidation Price
                </div>
            </div>
            <div className='token-core-items-one'>
                <div className='content'>
                    {formatTinyUSD(previewData.liquidationPrice.toFixed(10))}
                </div>
            </div>
        </div>
        )}
        {previewData.gap !== null && (
        <div className='token-core-information-fields'>
            <div className='token-core-items-one'>
                <div className='label'>
                    Price Gap Before Liquidation
                </div>
            </div>
            <div className='token-core-items-one'>
                <div className='content'>
                    {formatTinyUSD(previewData.gap.toFixed(10))}
                </div>
            </div>
        </div>
        )}
        </>
        
      )}
    </div>
  )
}

export default ShortPreview