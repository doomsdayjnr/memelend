import { useState, useEffect, type JSX, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import BN from 'bn.js';
import '../../styles/BuyToken.css';
import { useToast } from "../alerts/ToastContainer";
import ShareModal from '../social_media/ShareModal';

export default function GoShortToken({ mint, collateral, slippage, collateralPercent, tokenName }: any) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { showToast } = useToast();
  const [showShare, setShowShare] = useState(false); 
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  

  
  const handleShort = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!publicKey || !signTransaction) {
      showToast('Please connect your wallet', 'error');
      return;
    }

    if (collateralPercent > 50) {
      showToast("Collateral percentage cannot exceed 50%", 'error');
      return;
    }

    const solAmount = parseFloat(collateral);
    const lamports = solAmount * 1_000_000_000;
    const rentExempt = await connection.getMinimumBalanceForRentExemption(165);
    const totalRequired = lamports + rentExempt;
    const userBalance = await connection.getBalance(publicKey);
    const slippageBps = Math.floor(slippage * 100);

    if (userBalance < totalRequired) {
      showToast(`Not enough SOL to make transaction.`, 'error');
      return;
    }

    try {
      setLoading(true);

      const tempWSOLKeypair = Keypair.generate();

      const previewRes = await axios.get(`${apiBase}/token/short-preview`, {
        params: {
          mint,
          collateralAmount: lamports,
          collateralPercent,
          user: publicKey.toBase58(),
          slippage: slippageBps,
        }
      });

      const dataPreview = previewRes.data;

      if (!dataPreview.success || dataPreview.claimable === 0) {
        setPreviewData(null);
        showToast(dataPreview.message || "No rewards available yet.", 'error');
        setLoading(false);
        return;
      }

      if (previewRes.data.error) {
        showToast(`${previewRes.data.error}`, 'error');
        setLoading(false);
        return;
      }

      const maxShortRatio = 0.1;
      const entryPriceSOL = Number(previewRes.data.priceInSol);
      const tokenReserve = Number(previewRes.data.tokenReserve);
      const tokensOutNum = Number(previewRes.data.tokensOut);

      if (tokensOutNum > tokenReserve * maxShortRatio) {
        showToast(`You can only short up to 10% of the current vault reserve. Try reducing your position size.`, 'error');
        setLoading(false);
        return;
      }

      const { tokensOut, minTokensOut } = previewRes.data;
      const borrowedTokensBN = new BN(tokensOut);
      const minTokensOutBN = new BN(minTokensOut);

      const res = await axios.post(`${apiBase}/token/go-short`, {
        user: publicKey.toBase58(),
        mint,
        collateralAmount: solAmount,
        collateralPercent,
        entryPriceSOL,
        minTokensOut: minTokensOutBN.toString(),
        tempWSOLAccount: tempWSOLKeypair.publicKey.toBase58(),
      });

      const data = res.data;

      if (!data.success || data.claimable === 0) {
        showToast(data.message || "No rewards available yet.", 'error');
        return;
      }

      if (!res.data?.tx) {
        // console.error('Invalid transaction returned:', res.data);
        showToast('Backend did not return a valid transaction', 'error');
        return;
      }

      const { positionId } = res.data;
      const rawTx = Buffer.from(res.data.tx, 'base64');
      const tx = Transaction.from(rawTx);

      const signedTx = await signTransaction(tx);
      signedTx.partialSign(tempWSOLKeypair);
      const txid = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
      });

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: txid, ...latestBlockhash },
        'confirmed'
      );

      // // Add this right after confirmation
      // const txDetails = await connection.getTransaction(txid, {
      //   commitment: 'confirmed'
      // });

      // console.log(
      //   "Transaction logs:", 
      //   txDetails?.meta?.logMessages || "No logs available"
      // );

      showToast('✅ Short position opened successfully!', 'success');
      setShowShare(true);
    } catch (err: any) {
      console.error(err);
      if (err.response && err.response.data?.error) {
        showToast(`${err.response.data.error}`, 'error');
      } else {
        showToast('Failed to open short position', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  
  return (
    <div>
        <button onClick={handleShort} disabled={loading || previewLoading} className='shortbtn' type="button">
          {loading ? 'Short...' : 'Short'}
        </button>
        <ShareModal
          show={showShare}
          onClose={() => setShowShare(false)}
          title="Short is live!"
          tokenName={tokenName}
          message={`I just shorted ${tokenName} on MemeLend 😈🔥 Think it's going down? 📉 Trade it here 👇`}
          url={`https://qa.memelend.tech/token/${mint}`}
        />
    </div>
  );
}