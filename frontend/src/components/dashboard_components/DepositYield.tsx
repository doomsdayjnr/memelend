import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import './../../styles/ActionButton.css';
import { useToast } from "../alerts/ToastContainer"; 

function DepositYield({ mint, position_id}: { 
  mint: string | undefined;
  position_id: number;
}) {
    const [loading, setLoading] = useState(false);
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();
    const { showToast } = useToast();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    const handleDeposit = async () => {
    if (!publicKey || !signTransaction) {
      showToast('Connect your wallet first.', 'error');
      return;
    }
    if (!mint) {
      showToast('Enter a valid token mint and amount.', 'error');
      return;
    }

    try {
      setLoading(true);

      // Generate temp WSOL account
      const tempWSOLKeypair = Keypair.generate();

      // 1️⃣ Call backend to prepare deposit transaction
      const res = await axios.post(`${apiBase}/yield/yield-deposit`, {
        user: publicKey.toBase58(),
        mint,
        position_id,
        tempWSOLAccount: tempWSOLKeypair.publicKey.toBase58()
      });

      const data = res.data;
      
      if (!data.success || data.claimable === 0) {
          showToast(data.message || "No rewards available yet.", 'error');
          return;
        }

      if (!res.data?.tx) {
            showToast('Invalid response', 'error');
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
      showToast(`✅ Deposit successful!`, 'success');

    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
        <button onClick={handleDeposit} 
            disabled={loading}
            className={loading ? 'loading-button' : 'dashboard-atn-btn'}
        >{loading ? 'Staking...' : `Stake`}</button>
    </div>
  )
}

export default DepositYield