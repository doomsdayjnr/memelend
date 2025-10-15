import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import axios from 'axios';
import "../../styles/ActionButton.css";
import { useToast } from "../alerts/ToastContainer";

function ChangeReferralCode() {
  const { publicKey } = useWallet();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const { showToast } = useToast();

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setReferralCode('');
    setIsModalOpen(false);
  };

  const handleSubmit = async () => {
    if (!publicKey) {
      showToast('Connect your wallet first.', 'error');
      return;
    }
    if (!referralCode.trim()) {
      showToast('Enter a referral code.', 'error');
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post(`${apiBase}/reward/change-referrer-code`, {
        user: publicKey.toBase58(),
        referralCode: referralCode.trim(),
      });

      const data = res.data;

      if (!data.success) {
        showToast(data.message || "Referral name not available.", 'error');
        return;
      }

      showToast(`✅ Referral code changed!`, 'success');
      handleCloseModal();
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        disabled={loading}
        className={loading ? 'loading-button' : 'dashboard-atn-btn'}
      >
        {loading ? 'Changing...' : 'Change'}
      </button>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Change Referral Code</h3>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Enter new referral code"
              className="modal-input"
            />
            <div className="modal-buttons">
              <button onClick={handleSubmit} className="submit-btn" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit'}
              </button>
              <button onClick={handleCloseModal} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ChangeReferralCode;
