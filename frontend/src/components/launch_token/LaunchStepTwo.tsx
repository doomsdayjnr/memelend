import { useState, useEffect } from 'react';
import axios from 'axios';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import type { LaunchData } from '../LaunchForm';
import { useToast } from "../alerts/ToastContainer";

type LaunchStepTwoProps = {
  launchData: LaunchData | null;
  onComplete: (res: any) => void;
  socialStatus: (status: boolean) => void;
};

function LaunchStepTwo({ launchData, onComplete, socialStatus }: LaunchStepTwoProps) {
  if (!launchData) return null;

  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wsolVaultAddress, setwsolVaultAddress] = useState<string>('');
  const [transactionStep, setTransactionStep] = useState<number>(0);
  const { showToast } = useToast();

  
  const handleStepTwo = async () => {
    setLoading(true);
    let txid: string | undefined;

    if (!publicKey || !signTransaction) {
        showToast('Connect your wallet first.', 'error');
        return;
      }

    try {
      setTransactionStep(4);

      // 🔁 Request step 2 transaction from backend
      const step2Response = await axios.post(`${apiBase}/launch/prepare-step2`, {
        creator: publicKey!.toBase58(),
        tokenId: launchData.tokenId,
      });

      const { instructions: rawInstructions, wsolLiquidityVault } = step2Response.data;

      if (!step2Response.data.success || step2Response.data.claimable === 0) {
        showToast(step2Response.data.message || "No rewards available yet.", 'error');
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

      // Add this right after confirmation
      const txDetails = await connection.getTransaction(txid, {
        commitment: 'confirmed'
      });

      console.log(
        "Transaction logs:", 
        txDetails?.meta?.logMessages || "No logs available"
      );

      // 🎯 Save data to backend
      const totalSupply = 1_000_000_000 * 10 ** 6;

      // initial lending allocation
      let lendAmount = totalSupply * (launchData.formData.lendPercent / 100);

      // presale allocation
      let presaleAmount = 0;
      if (launchData.formData.presalePercent > 0) {
        presaleAmount = lendAmount * (launchData.formData.presalePercent / 100);
        lendAmount = lendAmount - presaleAmount; // adjust lending amount
      }

      // liquidity allocation
      const liquidityAmount = totalSupply - (lendAmount + presaleAmount);

      // save to backend
      const saveResponse = await axios.post(`${apiBase}/launch/save`, {
        ...launchData.formData,
        mint: launchData.mintAddress,
        uri: launchData.uri,
        launchTxSignature: txid,
        lendPercent: launchData.formData.lendPercent,
        lendAmount: lendAmount.toString(),
        presaleAmount: presaleAmount.toString(),
        liquidityAmount: liquidityAmount.toString(),
        lendingVault: launchData.lendingAddress,
        liquidityVault: launchData.liquidityAddress,
        wsolVault: wsolLiquidityVault,
        tokenId: launchData.tokenId,
      });

      onComplete(saveResponse.data);
      socialStatus(true);
      setTransactionStep(0);
    } catch (err: any) {
      if (err.message.includes("blockhash")) {
        showToast("Transaction expired. Please try again.", 'error');
        console.error('Step Two failed:', err.message);
      } else {
        showToast(err.response?.data?.error || err.message || 'Something went wrong', 'error');
        console.error('Step Two failed:', err.message);
      }
      setTransactionStep(3);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="launch-step-continue">
        <p className="success-msg">✅ Step One Complete</p>
        <p className="info-text">Next set up creator rewards</p>
        <button 
          disabled={loading}
          onClick={handleStepTwo} className="confirm-button">
          {loading ? "Finalizing launch..." : 'Finalize Token Launch'}
        </button>
      </div>
      {message? message: ""}
    </div>
  )
}

export default LaunchStepTwo