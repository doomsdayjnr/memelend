import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import axios from 'axios';
import type { LaunchData } from "../LaunchForm";
import '../../styles/AddLiquidity.css';
import { useToast } from "../alerts/ToastContainer";

type AddLiquidityProps = {
  launchData: LaunchData | null;
  onComplete: (res: any) => void;
};

function AddLiquidity({ launchData, onComplete }: AddLiquidityProps) {
  if (!launchData) return null;

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction } = useWallet();

  const handleAddLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      alert("Please connect your wallet");
      return;
    }

    const lamports = parseFloat(amount) * 1_000_000_000;
    const userBalance = await connection.getBalance(publicKey);

    if (userBalance < lamports) {
      showToast(`❌ Not enough SOL. You have ${userBalance / 1_000_000_000} SOL.`,'error');
      return;
    }

    try {
      setLoading(true);
     
      // Step 1: Request liquidity instruction from backend
      const res = await axios.post(`${apiBase}/liquidity/add-liquidity`, {
        creator: publicKey.toBase58(),
        mint: launchData.mintAddress,
        amount: parseFloat(amount),
      });

      const { instructions: rawInstructions} = res.data;
      if (!res.data.success) {
        showToast("Failed to add liquidity. Please try again.", 'error');
        return;
      }

      // Rebuild transaction with fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      });

      // Deserialize instructions from JSON
      for (const ixJson of rawInstructions) {
        const ix = new TransactionInstruction({
          programId: new PublicKey(ixJson.programId),
          keys: ixJson.keys.map((k: any) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(ixJson.data, "base64"),
        });
        tx.add(ix);
      }
      
      // Send transaction
      const txid = await sendTransaction(tx, connection);

      let status = null;
      const timeoutMs = 60000; // 60s
      const start = Date.now();

      while (true) {
        const { value } = await connection.getSignatureStatuses([txid]);
        status = value[0];

        if (status) {
          if (status.err) {
            showToast('Transaction failed', 'error');
            throw new Error(`Transaction ${txid} failed: ${JSON.stringify(status.err)}`);
          }

          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            break;
          }
        }

        if (Date.now() - start > timeoutMs) {
          throw new Error(`Transaction ${txid} not confirmed within ${timeoutMs / 1000}s`);
        }

        // wait 1s before polling again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // // Add this right after confirmation
      const txDetails = await connection.getTransaction(txid, {
        commitment: 'confirmed'
      });

      console.log(
        "Transaction logs:", 
        txDetails?.meta?.logMessages || "No logs available"
      );

      console.log("✅ Liquidity transaction confirmed:", txid);
     
      // Notify backend
      const saveResponse = await axios.post(`${apiBase}/liquidity/confirm`, {
        mint: launchData.mintAddress,
      });

      showToast("Liquidity added successfully! 🎉", 'success');
      onComplete(saveResponse.data);

    } catch (err) {
      console.error(err);
      alert('❌ Failed to add liquidity');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-liquidity-section">
      <h3 className="section-title">💧 Add Liquidity</h3>
      
      <div className="form-group">
        <label htmlFor="amount" className="input-label">Amount of SOL</label>
        <input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.50"
          className="input-field"
          required
        />
      </div>

      <div>
        <button 
          onClick={handleAddLiquidity} 
          disabled={loading} 
          className="btn-primary"
        >
          {loading ? 'Adding...' : 'Add Liquidity'}
        </button>
      </div>

      <div className="info-text">
        <p>
          <strong>Next:</strong> Add SOL liquidity to finalize your token launch. 
          You can also do this later from your <a href="/dashboard">dashboard</a>.
        </p>
        <p className="mint-info">Mint Address: {launchData.mintAddress}</p>
      </div>
    </div>
  );
}

export default AddLiquidity;
