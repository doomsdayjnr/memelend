import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import '../../styles/dashboard/DashboardTables.css';
import { useToast } from "../alerts/ToastContainer";


function UserReferralList() {
    const { publicKey } = useWallet();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    const [positions, setPositions] = useState<any[]>([]);
    const [positionsLoading, setPositionsLoading] = useState(true);
    const { showToast } = useToast();
    
    useEffect(() => {
        if (!publicKey) return;
    
        const fetchPositions = async () => {
        try {
            const res = await fetch(`${apiBase}/reward/all-referral/${publicKey.toString()}`);
            if (!res.ok) {
            showToast('Failed to fetch positions', 'error');
            }
            const data = await res.json();
            setPositions(data);
        } catch (err) {
            showToast('Failed to load positions', 'error');
            // console.error('Error fetching positions:', err);
        } finally {
            setPositionsLoading(false);
        }
        };
    
        setPositionsLoading(true);
        fetchPositions();
    }, [publicKey]);
    
    
  return (
    <div className="dashboard-table-frame">
        {positions.length === 0 ? (
        <div className="table-empty-state">
            <p>Share your referral link and earn a share of the fees</p>
            <Link to="/memecoins" className="empty-state-create-btn">
            ➕ Share Link
            </Link>
        </div>
        ) : (
        <div className="dashboard-table-wrapper">
            <table>
            <thead>
                <tr>
                    <th>Wallet</th>
                    <th>Username</th>
                    <th>Total Contribution</th>
                </tr>
            </thead>
            <tbody>
                {positions.map((position) => (
                <tr key={position.positionId}>
                    <td>{position?.wallet}</td>
                    <td>{position?.username}</td>
                    <td>${position?.totalAmount.toFixed(2)}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        )}
    </div>
  )
}

export default UserReferralList