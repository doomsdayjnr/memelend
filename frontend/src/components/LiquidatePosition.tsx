import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import '../styles/BuyToken.css'; 

function LiquidatePosition({ mint, position_id}: { 
  mint: string | undefined;
  position_id: number;
}) {

    const [loading, setLoading] = useState(false);
      
    const { connection } = useConnection();
    const { publicKey, signTransaction, sendTransaction } = useWallet();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    const handleClose = async () => {
        if (!publicKey || !signTransaction) {
          alert('Please connect your wallet');
          return;
        }
    
        try {
          setLoading(true);
          
          // Build sell transaction
          const res = await axios.post(`${apiBase}/token/liquidate-position`, {
            user: publicKey.toBase58(),
            mint,
            positionId: position_id,
          });
    
    
          if (!res.data?.instructions || !Array.isArray(res.data.instructions)) {
            console.error("Invalid instructions from backend", res.data);
            alert("❌ Backend returned invalid instructions");
            return;
          }
    
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

          const tx = new Transaction({
            feePayer: publicKey,
            blockhash,
            lastValidBlockHeight,
          });

          // Add all instructions
          res.data.instructions.forEach((ix: any, i: number) => {
            if (!ix.programId || !ix.keys) {
              throw new Error(`Instruction ${i} is missing programId or keys`);
            }
            tx.add(new TransactionInstruction({
              programId: new PublicKey(ix.programId),
              data: ix.data ? Buffer.from(ix.data, 'base64') : Buffer.alloc(0),
              keys: ix.keys.map((k: any) => ({
                pubkey: new PublicKey(k.pubkey),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })),
            }));
          });
          
          // Send transaction
          const txid = await sendTransaction(tx, connection, {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            });

            const confirmResult = await connection.confirmTransaction(
              { signature: txid, blockhash, lastValidBlockHeight },
              'confirmed'
            );


          // Add this right after confirmation
          const txDetails = await connection.getTransaction(txid, {
            commitment: 'confirmed'
          });

          console.log(
            "Transaction logs:", 
            txDetails?.meta?.logMessages || "No logs available"
          );
    
          alert(`✅ Closed tokens!`);
        } catch (err) {
          console.error(err);
          alert('❌ Failed to close tokens');
        } finally {
          setLoading(false);
        }
    };

  return (
    <div className="buy-token-container">
      <div className="actions">
        <button 
            onClick={handleClose} 
            disabled={loading}
            className={loading ? 'loading-button' : ''}
        >
            {loading ? 'Liquidating...' : 'Liquidate'}
        </button>
      </div>
    </div>
  )
}

export default LiquidatePosition
