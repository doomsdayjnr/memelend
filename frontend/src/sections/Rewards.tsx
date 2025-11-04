import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import '../styles/rewards/rewards.css';
import UserReferralList from '../components/rewards_component/UserReferralList';
import ClaimReferral from '../components/rewards_component/ClaimReferral';
import ChangeReferralCode from '../components/rewards_component/ChangeReferralCode';
import ReferralChart from '../components/rewards_component/ReferralChart';


interface RewardsState {
  referralCode?: string;
  pending: number;
  total: number;
  loading: boolean;
  error: string | null;
}

function Rewards() {
  const { publicKey } = useWallet();
  const [activeTab, setActiveTab] = useState<'referrals'>('referrals');
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const [rewards, setRewards] = useState<RewardsState>({ 
      pending: 0, 
      total: 0,
      loading: true,
      error: null 
    });
  
    useEffect(() => {
      if (!publicKey) return;
  
      const fetchRewards = async () => {
        try {
          const response = await fetch(
            `${apiBase}/reward/referral-rewards/${publicKey.toString()}`
          );
          
          if (!response.ok) {
            throw new Error('Failed to fetch rewards');
          }
  
          const data = await response.json();

          console.log('Fetched rewards data:', data);
  
          setRewards({
            referralCode: data.referralCode,
            pending: Number(data.pendingRewards),
            total: Number(data.totalEarned),
            loading: false,
            error: null
          });
  
        } catch (err) {
          console.error('Error fetching rewards:', err);
          setRewards(prev => ({
            ...prev,
            loading: false,
            error: 'Failed to load rewards'
          }));
        }
      };
  
      setRewards(prev => ({...prev, loading: true}));
      fetchRewards();
    }, [publicKey]);

    
    
      const renderTabContent = () => {
        switch (activeTab) {
          case 'referrals':
            return <UserReferralList/>;
          default:
            return null;
        }
      };
  
  
  return (
    <div className="rewards-container">
      <div className='rewards-content-container'>
        <div className='rewards-claim-frame'>
          <div className='rewards-content-claim-frame-one'>
            <div className="rewards-card-sections">
              <h3>Pending Rewards</h3>
              <h2>${rewards.pending}</h2>
            </div>
            <div className="rewards-card-sections">
              <h3>Total Earned</h3>
              <h2>${rewards.total}</h2>
            </div>
            <div className="rewards-card-sections">
              <h3>Your Referral Link</h3>
              <input
                type="text"
                readOnly
                value={`https://memelend.tech?ref=${rewards.referralCode || ''}`}
              />
              <button 
                onClick={() => navigator.clipboard.writeText(`https://memelend.tech?ref=${rewards.referralCode || ''}`)}
              >
                Copy
              </button>
            </div>
          </div>
          <div className='rewards-content-claim-frame-one'>
            <div className='rewards-claim-card-sections'>
              <h3>Change Your Referral Code Here</h3>
              <ChangeReferralCode/>
            </div>
            <div className='rewards-claim-card-sections'>
              <h3>Claim Your Referral Earnings</h3>
              <ClaimReferral/>
            </div>
          </div>
          <div className='rewards-content-claim-frame-two'>
            <ReferralChart/>
          </div>
        </div>
        <div className='rewards-user-frame'>
          <div className='rewards-user-tab-frame'>
            <button
              className={activeTab === 'referrals' ? 'active' : ''}
              onClick={() => setActiveTab('referrals')}
            >
              My Referrals
            </button>
          </div>
          <div className='rewards-user-content-frame'>
              {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Rewards
