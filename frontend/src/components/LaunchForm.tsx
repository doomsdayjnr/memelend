import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import '@solana/wallet-adapter-react-ui/styles.css';
import '../styles/LaunchForm.css';
import { HelpCircle } from "lucide-react";
import LaunchStepTwo from './launch_token/LaunchStepTwo';
import LaunchStepOne from './launch_token/LaunchStepOne';
import AddLiquidity from './launch_token/AddLiquidity';

export type LaunchData = {
  formData: any;            // you can replace `any` with your real form type later
  mintAddress: string;
  lendingAddress: string;
  liquidityAddress: string;
  wsolVaultAddress: string;
  tokenId: string;
  uri: string;
  finalTxid: string;
};


const LaunchForm = () => {
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionStep, setTransactionStep] = useState(0);
  const [launchData, setLaunchData] = useState<any>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [liquidityAdded, setLiquidityAdded] = useState(false); // Tracks if liquidity was added


  const getStepMessage = () => {
    const messages = [
      'Starting launch process...',
      'Preparing token launch...',
      'Awaiting your signature...',
      'First transaction complete. Continue to finalize...',
      'Finalizing launch...'
    ];
    return transactionStep > 0 ? messages[transactionStep] : '';
  };

  return (
    <div className="launch-form-container">
      <div className="header">
        <h2 className="launch-form-title">Launch your token in just 3 simple steps</h2>
        <div className='stages-frame'>
          <div className={transactionStep === 0 ? "stages-active" : "stages"}>
            Mint and Distribute
          </div>
          <div className={transactionStep === 0 ? "stage-bar-active" : "stage-bar"}></div>

          <div className={transactionStep === 3 && launchData && !response ? "stages-active" : "stages"}>
            Set up Creator Rewards
          </div>

          <div className={transactionStep === 3 && launchData && !response ? "stage-bar-active" : "stage-bar"}></div>

          <div className={response && !liquidityAdded ? "stages-active" : "stages"}>
            Add Initial SOL Liquidity
          </div>
        </div>
        <p className="subtitle">
          ✅ Complete all steps — including adding SOL liquidity — to finalize your token and make it tradeable. <br /><br />
          ℹ️ Make sure your wallet has enough SOL for fees.
        </p>
      </div>

      <div className="info-panel">
        <button className="info-toggle" onClick={() => setShowInfo(prev => !prev)}>
          <HelpCircle size={16} />
          <span>
            {showInfo ? ' Hide launch information' : 'Click here to learn how launching works'}
          </span>
        </button>

        {showInfo && (
          <div className="info-content"> 
            <p className="info-text">
              Here’s exactly what happens when you launch on <strong>MemeLend</strong>:
            </p>

            <ul className="info-steps">
              <li>
                <strong>Step 1 – Token Split:</strong>   
                Your supply is divided into two parts:
                <ul className="info-list">
                  <li>
                    🔒 <strong>Locked Creator Tokens:</strong> Your share is stored safely and released gradually. 
                    This prevents instant sell-offs and builds community trust.
                  </li>
                  <li>
                    💧 <strong>Liquidity Pool:</strong> The rest is paired with SOL, creating an instant market so your token can be traded from day one.
                  </li>
                </ul>
              </li>

              <li>
                <strong>Step 2 – Earn Rewards:</strong>  
                As your token trades, you collect ongoing benefits:
                <ul className="info-list">
                  <li>💸 <strong>0.5% Creator Fee</strong> on every buy/sell/short</li>
                  <li>📈 Interest whenever traders borrow your token to short</li>
                </ul>
              </li>

              <li>
                <strong>Step 3 – Unlock Your Tokens:</strong>  
                Your locked tokens follow the <strong>Dynamic Withdrawal Curve</strong>:
                <ul className="schedule-list">
                  <li>Day 1 → <strong>0%</strong> available</li>
                  <li>Day 7 → <strong>10%</strong> available</li>
                  <li>Day 30 → <strong>50%</strong> available</li>
                  <li>Day 180 → <strong>100%</strong> available</li>
                </ul>
                <p className="info-text">
                  This schedule keeps your community safe from “rug pulls” while giving you steady access to your tokens and rewarding long-term growth.
                </p>
              </li>
            </ul>
          </div>
        )}
      </div>
      {transactionStep === 0 && (
        <LaunchStepOne 
        onSuccess={(data: any) => {
          setLaunchData(data);
          setTransactionStep(3);
        }}/>
      )}
    
      {transactionStep === 3 && launchData && !response && (
        <LaunchStepTwo launchData={launchData} onComplete={setResponse}/>
      )}

      <div className="form-info">
        💰 As the creator, you’ll earn a <strong>0.5% fee</strong> on every buy/sell/short of your token.
        <br />
      </div>


      {response && (
          <>
            {launchData.formData.isPresale ? (
              <div className="result-box success">
                <p className="success-msg">
                  ✅ Token launched successfully! This token is listed as a <strong>Pre-Sale</strong> for funding.
                </p>
                <p className="helper-text">
                  Users can now participate in the pre-sale. Your allocation will be distributed according to the pre-sale settings.
                </p>
              </div>
            ) : liquidityAdded ? (
              <div className="result-box success">
                <p className="success-msg">✅ Token launched successfully!</p>
              </div>
            ) : (
              <AddLiquidity 
                launchData={launchData}
                onComplete={(res) => {
                  console.log("Liquidity added ✅", res);
                  setLiquidityAdded(true);
                }}
              />
            )}
          </>
        )}

      {error && (
        <div className="result-box error">
          <p className="error-msg">❌ Launch Failed</p>
          <p>{error}</p>
          {transactionStep > 0 && (
            <p className="error-details">Failed at step {transactionStep}: {getStepMessage()}</p>
          )}
          <p className="error-details">Make sure you have enough SOL for transaction fees.</p>
        </div>
      )}
    </div>
  );

};

export default LaunchForm;
