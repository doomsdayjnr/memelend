import { useDropzone } from 'react-dropzone';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useToast } from "../alerts/ToastContainer";

type LaunchStepOneProps = {
  onSuccess: (data: any) => void;  // required prop
};

function LaunchStepOne({ onSuccess }: LaunchStepOneProps) {

  const { publicKey, signTransaction, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const [categories, setCategories] = useState<any[]>([]);
    const { showToast } = useToast();
    const [formData, setFormData] = useState({
      creator: '',
      name: '',
      symbol: '',
      description: '',
      image: '',
      website: '',
      twitter: '',
      telegram: '',
      discord: '',
      lendPercent: 10,
      isPresale: false,
      presalePercent: 0,
      presaleStart: '', 
      presaleEnd: '', 
      subCategories: [] as number[],
    });
  
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [transactionStep, setTransactionStep] = useState<number>(0);
    const [mintAddress, setMintAddress] = useState<string>('');
    const [lendingAddress, setLendingAddress] = useState<string>('');
    const [liquidityAddress, setLiquidityAddress] = useState<string>('');
    const [tokenId, setTokenId] = useState<string>("");
    const [uri, setUri] = useState('');
    const [transactions, setTransactions] = useState<string[]>([]);
    const [finalTxid, setFinalTxid] = useState<string>('');
    const [touched, setTouched] = useState(false);

    const TOTAL_SUPPLY = 1_000_000_000;
    const creatorTokens = (formData.lendPercent / 100) * TOTAL_SUPPLY;
    const presaleTokens = (formData.presalePercent / 100) * creatorTokens;

  useEffect(() => {
    if (publicKey) {
      setFormData(prev => ({ ...prev, creator: publicKey.toBase58() }));
    }
  }, [publicKey]);

  useEffect(() => {
    axios.get(`${apiBase}/launch/categories`)
      .then(res => setCategories(res.data))
      .catch(err => console.error("Failed to load categories:", err));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "lendPercent" || name === "presalePercent"
          ? Number(value)
          : value,
    }));
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    // If no file selected (cancel) and an image already exists, just return silently
    if (!file) {
      if (formData.image) return; 
      showToast("Please select an image.", 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image too large. Max size is 2MB.', 'error');
      return;
    }

    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);

      const uploadRes = await axios.post(
        `${apiBase}/launch/upload-image`,
        formDataObj,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setFormData(prev => ({ ...prev, image: uploadRes.data.imageUrl }));
      
    } catch (err) {
      console.error('Image upload failed:', err);
      showToast('Image upload failed. Please try a different file.', 'error');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  function toUTCString(localDateString: string) {
    const local = new Date(localDateString);
    // convert to UTC correctly
    return new Date(local.getTime() - local.getTimezoneOffset() * 60000)
      .toISOString();
  }

    
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    

    if (!publicKey || !signTransaction) {
        showToast('Connect your wallet first.', 'error');
        return;
      }

    if (!formData.name || !formData.symbol || !formData.description || !formData.image) {
      showToast("Please fill all required fields and upload a valid image.", 'error');
      return;
    }

    if (formData.isPresale) {
      const now = new Date();
      const start = new Date(formData.presaleStart);
      const end = new Date(formData.presaleEnd);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        showToast("Please provide valid pre-sale start and end times.", 'error');
        return;
      }

      if (end <= start) {
        showToast("Pre-sale end time must be after start time.", 'error');
        return;
      }

      if (end <= now) {
        showToast("Pre-sale end time must be in the future.", 'error');
        return;
      }

      const bufferMs = 2 * 60 * 1000; // 2 minutes
      if (start.getTime() < now.getTime() - bufferMs) {
        showToast("Pre-sale start time must be in the future.", 'error');
        return;
      }

    }

    try {

      setLoading(true);
      setTransactionStep(0);
      
      const res = await axios.post(`${apiBase}/launch/prepare`, {
        ...formData,
        presaleStart: formData.presaleStart ? toUTCString(formData.presaleStart) : null,
        presaleEnd: formData.presaleEnd ? toUTCString(formData.presaleEnd) : null,
      });


      const {mintAddress, tokenId, uri, lendingAddress, liquidityAddress,  instructions: rawInstructions} = res.data;
      setMintAddress(mintAddress);
      setTokenId(tokenId);
      setUri(uri);
      setFinalTxid(res.data.tx);
      setLendingAddress(lendingAddress);
      setLiquidityAddress(liquidityAddress);


        if (!res.data.success || res.data.claimable === 0) {
          showToast(res.data.message || "No rewards available yet.", 'error');
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

       
        onSuccess({
          formData,
          mintAddress,
          lendingAddress,
          liquidityAddress,
          tokenId,
          uri,
          tx,
        });

        showToast(`Step One Completed`, 'success');

    } catch (err: any) {
        console.error(err);
        showToast(`Step One failed, Please Try Again.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="launch-form-container">
      <form onSubmit={handleSubmit} className="launch-form">
        {[
          'name', 'symbol', 'description', 'website', 'twitter', 'telegram', 'discord',
        ].map(field => {
          const isRequired = ['name', 'symbol', 'description'].includes(field);
          const label = field.charAt(0).toUpperCase() + field.slice(1);

          return (
            <input
              key={field}
              name={field}
              value={(formData as any)[field]}
              onChange={handleChange}
              placeholder={isRequired ? label : `${label} (optional)`}
              className="input-field"
              required={isRequired}
            />
          );
        })}

        <div className="form-group categories-section">
          <label className="form-label">
            Pick the categories that accurately represent your token. Multiple selections allowed.
          </label>
          {categories.map(cat => (
            <details key={cat.id} className="category-accordion">
              <summary>{cat.name}</summary>
              <div className="subcategory-list">
                {cat.subCategories.map((sub: any) => (
                  <label key={sub.id} className="subcategory-item">
                    <input
                      type="checkbox"
                      value={sub.id}
                      checked={formData.subCategories.includes(sub.id)}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setFormData(prev => ({
                          ...prev,
                          subCategories: e.target.checked
                            ? [...prev.subCategories, id]
                            : prev.subCategories.filter(i => i !== id),
                        }));
                      }}
                    />
                    {sub.name}
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
        
        <div className="form-group">
          <label htmlFor="lendPercent" className="percentage-label">
            Choose how much of the <strong>1B token supply</strong> you want to keep as your 
            <strong> Creator’s Allocation</strong>.  
            You may allocate up to <strong>30%</strong>.  
            <br />
            <span className="helper-text">
              If you enable Pre-Sale, the chosen amount will be used for both 
              your personal staking rewards <em>and</em> pre-sale distribution.  
              Any remaining tokens will automatically go into liquidity to 
              seed the bonding curve.
            </span>
          </label>
          <input
            id="lendPercent"
            name="lendPercent"
            type="number"
            value={touched ? formData.lendPercent : ""}
            onChange={(e) => {
              setTouched(true);
              handleChange(e);
            }}
            min="1"
            max="30"
            placeholder="Creator Allocation % (e.g. 10)"
            className="input-field"
            required
          />
          <div className="presale-section">
            <label className="form-label">
              Pre-Sale Funding
            </label>
            <div className="presale-toggle">
              <input
                type="checkbox"
                name="isPresale"
                id="presale"
                checked={formData.isPresale}
                onChange={handleChange}
              />
              <span>Enable pre-sale to raise funds before launch</span>
            </div>

            {formData.isPresale && (
              <div className="presale-fields">
                <label className="percentage-label">
                  Pre-sale allocation % (taken from creator’s portion)
                  {formData.presalePercent > 0 && (
                    <span className="helper-text">
                      → {presaleTokens.toLocaleString()} tokens allocated to pre-sale 
                      (from {creatorTokens.toLocaleString()} creator tokens).
                    </span>
                  )}
                </label>
                <input
                  name="presalePercent"
                  type="number"
                  value={formData.presalePercent > 0 ? formData.presalePercent : ""}
                  onChange={handleChange}
                  min="1"
                  max="20"
                  placeholder="e.g. 10"
                  className="input-field"
                  required
                />
                <p className="helper-text"> 
                  A default starting price is set for the presale. The price then rises gradually according to the bonding curve as tokens sell out. 
                </p>

                <p className="highlight-box">
                  🎉 Pre-sale buyers also earn a share of <strong>creator fees </strong> 
                  as long as they hold their tokens.
                  <br />
                  <small>
                    Since the creator fee is <strong>0.5%</strong>, this will be
                    split <strong>50/50</strong> between you (the creator) and pre-sale
                    holders while pre-sale tokens exist.  
                    For example: if pre-sale is <strong>{formData.presalePercent || 0}%</strong>, 
                    then pre-sale holders collectively receive 
                    <strong>{((formData.presalePercent * 0.5) / 100) / 2}%</strong> of all trading volume,
                    while you receive the other half.  
                    Once all pre-sale tokens are sold off, you regain the full <strong>0.5%</strong>.
                  </small>
                </p>

                <label className="percentage-label">
                  Pre-sale start date (US Eastern Time)
                </label>
                <input
                  type="datetime-local"
                  name="presaleStart"
                  value={formData.presaleStart}
                  onChange={handleChange}
                  className="input-field"
                  required
                />

                <label className="percentage-label">
                  Pre-sale end date (US Eastern Time)
                </label>
                <input
                  type="datetime-local"
                  name="presaleEnd"
                  value={formData.presaleEnd}
                  onChange={handleChange}
                  className="input-field"
                  required
                />
                <p className="helper-text">
                  Times are based on <strong>US Eastern Time (ET)</strong>. Make sure to adjust your input if your local time differs.
                </p>
              </div>
            )}

          </div>
          
          <div className="dropzone" {...getRootProps()}>
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>Drop the image here...</p>
            ) : formData.image ? (
              <p>📁 Click to replace the current image</p>
            ) : (
              <p>📁 Drag & drop image here, or click to select</p>
            )}
          </div>
          <p className="helper-text">
            🖼️ This image will be used as your token’s official logo on MemeLend.
          </p>

          {formData.image && (
            <div className="image-preview">
              <img src={formData.image} alt="Uploaded Preview" />
              <p className="text-sm text-green-500 mt-1">✅ Image uploaded successfully</p>
            </div>
          )}
          {formData.lendPercent > 30 && (
            <div className="warning-box">
              ⚠️ <strong>High percentage detected!</strong><br />
              This token will have low initial liquidity at launch, which could cause high slippage and price volatility.
              <br />
              <span className="text-sm text-gray-600">
                Recommended max lending: <strong>20%–30%</strong> for fair liquidity and tradability.
              </span>
            </div>
          )}
          <p className="helper-text">
            🔁 <strong>{formData.lendPercent}%</strong> of your token supply will be made borrowable.<br />
            The remaining <strong>{100 - formData.lendPercent}%</strong> will be available for trading at launch.
          </p>
        </div>
        {transactionStep > 0 && (
          <div className="warning-box">
            ⏱️ Transaction expires in ~2 minutes. If it fails, refresh and restart.
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !publicKey || !signTransaction || transactionStep > 2}
          className="launch-button"
          onClick={(e) => {
            if (loading) e.preventDefault();
          }}
        >
          {loading ? "Starting launch process..." : 'Launch Token'}
        </button>
      </form>
      {message? message: ""}
    </div>
  )
}

export default LaunchStepOne;