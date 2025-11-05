import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import '../../styles/BuyToken.css';
import BN from 'bn.js';
import { useToast } from "../alerts/ToastContainer";
import ShareModal from '../social_media/ShareModal';

export default function BuyToken({ mint, amount, slippage, tokenName }: any) {
  const [loading, setLoading] = useState(false);
  const [minTokensOut, setMinTokensOut] = useState(null);
  const { showToast } = useToast();
  const [showShare, setShowShare] = useState(false); 
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!publicKey || !signTransaction) {
      showToast('Please connect your wallet', 'error');
      return;
    }

    const solAmount = parseFloat(amount);
    const lamports = solAmount * 1_000_000_000;
    const rentExempt = await connection.getMinimumBalanceForRentExemption(165);
    const totalRequired = lamports + rentExempt;
    const userBalance = await connection.getBalance(publicKey);
    const slippageBps = Math.floor(slippage * 100);
    
    if (userBalance < totalRequired) {
      showToast(`Not enough SOL. You have ${userBalance / 1_000_000_000} SOL.`, 'error');
      return;
    }

    try {
      setLoading(true);

      // 1️⃣ Generate the temp WSOL account on the frontend
      const tempWSOLKeypair = Keypair.generate();

      // Fetch token price
      const previewRes = await axios.get(`${apiBase}/token/buy-preview`, {
        params: { 
          mint, 
          solAmount,
          user: publicKey?.toBase58() ?? '', 
          slippage:slippageBps,
        }
      });

        const dataPreview = previewRes.data;

        if (!dataPreview.success || dataPreview.claimable === 0) {
          showToast(dataPreview.message || "No rewards available yet.", 'error');
          return;
        }

      const { tokensOut, minTokensOut } = previewRes.data;
      setMinTokensOut(minTokensOut);
      const tokensOutBN = new BN(tokensOut);
      const minTokensOutBN = new BN(minTokensOut);

      // Ask backend to build the transaction
      const res = await axios.post(`${apiBase}/token/buy-token`, {
        user: publicKey.toBase58(),
        mint,
        solAmount,
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
        showToast('Did not return a valid transaction', 'error');
        return;
      }

      const rawTx = Buffer.from(res.data.tx, 'base64');
      const tx = Transaction.from(rawTx);

      const signedTx = await signTransaction(tx);
  
      signedTx.partialSign(tempWSOLKeypair);
      const txid = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
      });
      
      const info = await connection.getParsedAccountInfo(tempWSOLKeypair.publicKey);

      const latestBlockhash = await connection.getLatestBlockhash();
      const confirmation = await connection.confirmTransaction(
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

      if (confirmation?.value?.err) {
        showToast('Transaction was confirmed but failed', 'error');
      }

      showToast('Token purchase successful!', 'success');
      setShowShare(true);

    } catch (err) {
      console.error(err);
      showToast('Failed to buy token', 'error');
    } finally {
      setLoading(false);
    }

  };

  return (
    <div>
        <button onClick={handleBuy} disabled={loading} className='buybtn' type="button">
          {loading ? 'Buy...' : 'Buy'}
        </button>
        <ShareModal
          show={showShare}
          onClose={() => setShowShare(false)}
          title="I just bought!"
          tokenName={tokenName}
          message={"Just bought into this token on MemeLend! 🚀 Check it out 👇"}
          url={`https://memelend.tech/token/${mint}`}
        />
    </div>
  );
}
