import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import axios from 'axios';
import "../../styles/dashboard/Modal.css"; 
import { useToast } from "../alerts/ToastContainer";

interface AddLiquidityModalProps {
  token: any; // you can make this more strict later with a proper type
  onClose: () => void;
}

function AddLiquidityModal({ token, onClose }: AddLiquidityModalProps) {

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const [amount, setAmount] = useState<string>("");
      const [loading, setLoading] = useState(false);
      const { showToast } = useToast();
    
      const { connection } = useConnection();
      const { publicKey, sendTransaction } = useWallet();
    
      const handleAddLiquidity = async () => {
        if (!publicKey || !sendTransaction) {
          showToast("Please connect your wallet");
          return;
        }
    
        const lamports = parseFloat(amount) * 1_000_000_000;
        const userBalance = await connection.getBalance(publicKey);
    
        if (userBalance < lamports) {
          alert(`❌ Not enough SOL. You have ${userBalance / 1_000_000_000} SOL.`);
          return;
        }
    
        try {
          setLoading(true);
    
          // Step 1: Request liquidity instruction from backend
          const res = await axios.post(`${apiBase}/liquidity/add-liquidity`, {
            creator: publicKey.toBase58(),
            mint: token.mint,
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
          // const txDetails = await connection.getTransaction(txid, {
          //   commitment: 'confirmed'
          // });

          // console.log(
          //   "Transaction logs:", 
          //   txDetails?.meta?.logMessages || "No logs available"
          // );
    
          // console.log("✅ Liquidity transaction confirmed:", txid);

          await axios.post(`${apiBase}/liquidity/confirm`, {
            mint: token.mint,
          });
          
          showToast("Liquidity added successfully! 🎉", 'success');
          onClose();
    
        } catch (err) {
          console.error(err);
          showToast('❌ Failed to add liquidity');
        } finally {
          setLoading(false);
        }
      };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* Close button */}
        <button className="modal-close" onClick={onClose}>
          ✖
        </button>

        {/* Token info */}
        <h2>💧 Add Liquidity</h2>
        <p>
          <strong>{token.name}</strong> ({token.symbol})
        </p>
        <p>Mint: {token.mint}</p>

        {/* Example input */}
        <div className="modal-body">
          <p>Add liquidity to increase your token’s price floor and reward your community — it’s how you show long-term commitment to your holders.</p>
          <label>Amount of SOL to add:</label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter SOL amount"
            className="modal-input"
            required
          />
        </div>

        {/* Action buttons */}
        <div className="modal-actions">
          <button className="confirm-btn"
          onClick={handleAddLiquidity} 
          disabled={loading} 
          >
            {loading ? 'Adding...' : 'Add Liquidity'}
          </button>
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddLiquidityModal;
