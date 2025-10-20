import { useState, useEffect } from "react";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import type { TransactionResponse } from '@solana/web3.js';
import axios from 'axios';
import BN from 'bn.js';
import "../../styles/presale/JoinPresaleModal.css";
import { useToast } from "../alerts/ToastContainer"; 

function JoinPresaleButton({ mint, presaleStart, presaleEnd }: { mint: string | undefined; presaleStart: string; presaleEnd: string; }) {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const [isOpen, setIsOpen] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [amount, setAmount] = useState("");
    const [slippage, setSlippage] = useState(1); // default = 1%
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const openModal = () => setIsOpen(true);
    const closeModal = () => {
        setIsOpen(false);
        setAmount("");
    };

    useEffect(() => {
      const now = new Date();
      const start = new Date(presaleStart);
      const end = new Date(presaleEnd);
      setIsActive(now >= start && now <= end);

      // optional: auto-refresh status every 30 seconds
      const interval = setInterval(() => {
        const nowCheck = new Date();
        setIsActive(nowCheck >= start && nowCheck <= end);
      }, 30_000);

      return () => clearInterval(interval);
    }, [presaleStart, presaleEnd]);

    const handleSubmit = async () => {
        if (!publicKey || !sendTransaction) {
            showToast("Please connect your wallet", 'error');
            return;
        }

        const solAmount = parseFloat(amount);
        if (isNaN(solAmount) || solAmount <= 0) {
          showToast("Please enter a valid amount.", "error");
          return;
        }

        if (solAmount > 3) {
          showToast("You can’t contribute more than 3 SOL at a time.", "error");
          return;
        }
        const lamports = solAmount * 1_000_000_000;
        const rentExempt = await connection.getMinimumBalanceForRentExemption(165);
        const totalRequired = lamports + rentExempt;
        const slippageBps = Math.floor(slippage * 100);
        const userBalance = await connection.getBalance(publicKey);

        if (userBalance < totalRequired) {
            showToast(`Not enough SOL to make transaction.`, 'error');
            return;
        }

        try {
            setLoading(true);

            const tempWSOLKeypair = Keypair.generate();

            const previewRes = await axios.get(`${apiBase}/token/join-presale-preview`, {
              params: {
                user: publicKey.toBase58(),
                mint,
                amount: solAmount,
                slippage: slippageBps,
              }
            });

            const dataPreview = previewRes.data;

            if (!dataPreview.success || dataPreview.claimable === 0) {
              showToast(dataPreview.message || "Error encounted, please try again.", 'error');
              setLoading(false);
              return;
            }

            if (previewRes.data.error) {
              showToast(`❌ ${previewRes.data.error}`, 'error');
              setLoading(false);
              return;
            }

            const { minTokensOut } = previewRes.data;
            const minTokensOutBN = new BN(minTokensOut);
            console.log("Min tokens out (BN):", minTokensOutBN.toString());


            // Step 1: Request liquidity instruction from backend
            const res = await axios.post(`${apiBase}/token/join-presale`, {
              user: publicKey.toBase58(),
              mint,
              amount,
              minTokensOut: minTokensOutBN.toString(),
              tempWSOLAccount: tempWSOLKeypair.publicKey.toBase58(),
            });

            const { instructions: rawInstructions} = res.data;
            if (!res.data.success) {
              showToast("Failed to join presale. Please try again.", 'error');
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

            tx.partialSign(tempWSOLKeypair);

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

            
            showToast("Presale tokens added successfully! 🎉", 'success');
            closeModal();

        } catch (err) {
            console.error(err);
            showToast('Failed to add join presale. Please try again.', 'error');
        } finally {
            setLoading(false);
        }

    };

  return (
    <div>
      <button className="presale-action-button" onClick={openModal}
      disabled={!isActive}
      title={
        !isActive
          ? new Date() < new Date(presaleStart)
            ? "Presale has not started yet"
            : "Presale has ended"
          : "Join the presale"
      }
      >
        {isActive ? "Join Presale" : "Not Active"}
      </button>

      {isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Join Presale</h3>
            {/* Slippage Input */}
            <div className="slippage-input">
              <label htmlFor="">
                💡 Each wallet can join the presale only once.  
                You can contribute up to <strong>3&nbsp;SOL</strong> in your single purchase to keep things fair for everyone.
              </label>
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
            <p>Enter the amount you’d like to contribute:</p>
            <input
              type="number"
              value={amount}
              min={"0.01"}
              max={"3"}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter SOL amount (max 3)"
              className="modal-input"
            />

            <div className="modal-actions">
              <button className="modal-submit" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Submiting...' : 'Submit'}
              </button>
              <button className="modal-cancel" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JoinPresaleButton;
