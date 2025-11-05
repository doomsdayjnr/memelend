import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import '../../styles/ActionButton.css';
import { useToast } from "../alerts/ToastContainer"; 
import ShareModal from '../social_media/ShareModal';

function CloseToken({ mint, position_id, tokenName }: any) {
    const [loading, setLoading] = useState(false);
      
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const { showToast } = useToast();
    const [showShare, setShowShare] = useState(false); 
    const handleClose = async () => {
        if (!publicKey || !signTransaction) {
          showToast('Please connect your wallet', 'error');
          return;
        }
    
        try {
          setLoading(true);
          
          // Generate temp WSOL account
          const tempWSOLKeypair = Keypair.generate();
          
          // Get sell preview to calculate minSolOut
          const previewRes = await axios.get(`${apiBase}/token/close-preview`, {
            params: { 
                position_id,
                user: publicKey.toBase58(),
                mint, 
                slippage: 300 // 1% slippage (fixed)
            }
          });
          
          const dataPreview = previewRes.data;

          if (!dataPreview.success || dataPreview.claimable === 0) {
            showToast(dataPreview.message || "No rewards available yet.", 'error');
            return;
          }
    
          const { minTokenAmountToRepay } = previewRes.data;
          
          // Build sell transaction
          const res = await axios.post(`${apiBase}/token/close-short`, {
            user: publicKey.toBase58(),
            mint,
            minTokenAmountToRepay,
            positionId: position_id,
            tempWSOLAccount: tempWSOLKeypair.publicKey.toBase58(),
          });
    
          const data = res.data;

          if (!data.success || data.claimable === 0) {
            showToast(data.message || "No rewards available yet.", 'error');
            return;
          }

          if (!res.data?.tx) {
            // console.error('Invalid transaction:', res.data);
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
    
          showToast(`Closed tokens`, 'success');
          setShowShare(true);
        } catch (err) {
          console.error(err);
          showToast('Failed to close tokens', 'error');
        } finally {
          setLoading(false);
        }
    };

  return (
      <div>
        <button 
            onClick={handleClose} 
            disabled={loading}
            className={loading ? 'loading-button' : 'dashboard-atn-btn'}
        >
            {loading ? 'Closing...' : 'Close'}
        </button>
        <ShareModal
          show={showShare}
          onClose={() => setShowShare(false)}
          title="Closed my short with profit!"
          tokenName={tokenName}
          message={`Closed my short on ${tokenName} with profit 💰😈 MemeLend strikes again 🔥`}
          url={`https://memelend.tech/token/${mint}`}
        />
      </div>
  )
}

export default CloseToken
