import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import '../../styles/ActionButton.css'; 
import { useToast } from "../alerts/ToastContainer";
import ShareModal from '../social_media/ShareModal';

export default function SellToken({ mint, position_id, tokenName }: any) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [slippage, setSlippage] = useState(1); // default = 1%
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null);
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const { showToast } = useToast();
  const [showShare, setShowShare] = useState(false); 

  const handleSell = async () => {
    if (!publicKey || !signTransaction) {
      showToast('Please connect your wallet', 'error');
      return;
    }
    if (!selectedPercentage) {
      showToast('Please select a sell amount', 'error');
      return;
    }

    try {
      setLoading(true);

      // Generate temp WSOL account
      const tempWSOLKeypair = Keypair.generate();

      // Get sell preview with chosen slippage
      const previewRes = await axios.get(`${apiBase}/token/sell-preview`, {
        params: { 
          mint, 
          position_id,
          user: publicKey.toBase58(),
          slippage: slippage * 100 // convert % → bps
        }
      });

      const dataPreview = previewRes.data;

      if (!dataPreview.success || dataPreview.claimable === 0) {
        showToast(dataPreview.message || "No rewards available yet.", 'error');
        return;
      }

      // adjust amounts by selectedPercentage
      const { minSolOut, tokenAmount, grossSolOut } = dataPreview;
      const adjustedMinSolOut = Math.floor(minSolOut * selectedPercentage);
    
      const adjustedTokenAmount = Math.floor(tokenAmount * selectedPercentage);
      

      // Build sell transaction
      const res = await axios.post(`${apiBase}/token/sell-token`, {
        user: publicKey.toBase58(),
        mint,
        position_id,
        minSolOut: adjustedMinSolOut,
        tokenAmount: adjustedTokenAmount,
        tempWSOLAccount: tempWSOLKeypair.publicKey.toBase58()
      });

      const data = res.data;

      if (!data.success || data.claimable === 0) {
        showToast(data.message || "No rewards available yet.", 'error');
        return;
      }

      if (!res.data?.tx) {
        showToast('Backend error: Invalid transaction', 'error');
        return;
      }

      // Deserialize and sign transaction
      const rawTx = Buffer.from(res.data.tx, 'base64');
      const tx = Transaction.from(rawTx);
      const signedTx = await signTransaction(tx);
      signedTx.partialSign(tempWSOLKeypair);

      // Send transaction
      const txid = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
      });

      // Confirm transaction
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

      showToast(`Sold ${selectedPercentage * 100}% of tokens`, 'success');
      setShowShare(true);
      setShowModal(false); // close modal on success
    } catch (err) {
      showToast('Failed to sell tokens', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Trigger Button */}
      <button 
        onClick={() => setShowModal(true)} 
        disabled={loading}
        className={loading ? 'loading-button' : 'dashboard-atn-btn'}
      >
        {loading ? 'Processing...' : 'Close'}
      </button>
      <ShareModal
        show={showShare}
        onClose={() => setShowShare(false)}
        title="Sold with profit!"
        tokenName={tokenName}
        message={`Just sold ${tokenName} and took profit 💰🔥 MemeLend always delivers 🚀`}
        url={`https://memelend.tech/token/${mint}`}
      />

      {/* Modal */}
      {showModal && (
        <div className="sell-modal-overlay">
          <div className="sell-modal-content">
            <h3>Select Sell Amount</h3>

            {/* Slippage Input */}
            <div className="slippage-input">
              <label htmlFor="slippage">Slippage (%)</label>
              <input
                id="slippage"
                type="number"
                min="0.1"
                step="0.1"
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
              />
            </div>

            <div className="sell-options">
              <button 
                className={selectedPercentage === 0.25 ? "active" : ""}
                onClick={() => setSelectedPercentage(0.25)}
              >
                Quarter (25%)
              </button>
              <button 
                className={selectedPercentage === 0.5 ? "active" : ""}
                onClick={() => setSelectedPercentage(0.5)}
              >
                Half (50%)
              </button>
              <button 
                className={selectedPercentage === 0.75 ? "active" : ""}
                onClick={() => setSelectedPercentage(0.75)}
              >
                Three Quarters (75%)
              </button>
              <button 
                className={selectedPercentage === 1 ? "active" : ""}
                onClick={() => setSelectedPercentage(1)}
              >
                Full (100%)
              </button>
            </div>

            <div className="sell-modal-actions">
              <button 
                onClick={handleSell} 
                disabled={!selectedPercentage || loading}
                className="sell-submit-btn"
              >
                {loading ? "Processing..." : "Submit"}
              </button>
              <button className="sell-close-modal" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
