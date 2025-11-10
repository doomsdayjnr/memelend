import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import '../../styles/dashboard/DashboardTables.css';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import Withdrawal from './Withdrawal';
import { Link } from 'react-router-dom';
import ClaimYield from './ClaimYield';
import CreatorWithdrawal from './CreatorWithdrawal';
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';


interface yieldUserPosition {
  openedAt: string;
  publicKey: string;
  mint: string;
  deposited: string;
  rewardDebt: string;
  claimedTotal: string;
  depositedAt: string;
  lastActionTs: string;
  positionId:number;
  isCreator: boolean;
  pendingRewards: number;
  token: {
    name: string;
    symbol: string;
    image?: string;
    decimals: number;
  };
}


function YieldUsersPosition() {

    const { publicKey } = useWallet();
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
      const [positions, setPositions] = useState<yieldUserPosition[]>([]);
      const [positionsLoading, setPositionsLoading] = useState(true);
      const { showToast } = useToast();

      useEffect(() => {
        if (!publicKey) return;
    
        const fetchYieldPositions = async () => {
          try {
            const res = await fetch(`${apiBase}/positions/yield-positions/${publicKey.toString()}`);
            if (!res.ok){
              showToast('Failed to fetch positions', 'error');
            } 
            const data = await res.json();
            // normalize balances using token decimals
            const enrichedData = data.map((pos: any) => {
              const decimals = pos.token?.decimals ?? 6; // fallback to 6 if missing
              return {
                ...pos,
                deposited: pos.deposited / 10 ** decimals,
                rewardDebt: pos.rewardDebt / 10 ** decimals,
                claimedTotal: pos.claimedTotal / 10 ** decimals,
                pendingRewards: pos.pendingRewards,
              };
            });

            setPositions(enrichedData);
          } catch (err) {
            showToast(`Error fetching positions:, ${err}`, 'error');
          } finally {
            setPositionsLoading(false);
          }
        };
    
        setPositionsLoading(true);
        fetchYieldPositions();
        const intervalId = setInterval(fetchYieldPositions, 30_000);

        return () => clearInterval(intervalId);
      }, [publicKey]);
    
  return (
      <div className="dashboard-table-frame">
        {positions.length === 0 ? (
          <div className="table-empty-state">
            <p>You don't have any staked open positions</p>
            <Link to="/memecoins" className="empty-state-create-btn">
              ➕ Buy your first token
            </Link>
          </div>
        ) : (
          <div className="dashboard-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Mint</th>
                  <th>Name</th>
                  <th>Staked</th>
                  <th>Rewards</th>
                  <th>Creator</th>
                  <th>Claim Rewards</th>
                  <th>Close Stake</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.positionId}>
                    <td>
                      <div className="dashboard-image-wrapper">
                        {position.token?.image ? (
                          <img
                            src={position.token?.image}
                            alt={position.token?.name}
                            className="dashboard-token-img"
                          />
                        ) : '—'}
                        <img
                          src={logo_overlay}
                          alt="MemeLend logo"
                          className="dashboard-overlay-img"
                        />
                      </div>
                    </td>
                    <td>
                      <div
                        className="dashboard-mint-hash"
                        onClick={() => navigator.clipboard.writeText(position.mint)}
                        title={`Click to copy\n${position.mint}`}
                      >
                        {position.mint.slice(0, 4)}...{position.mint.slice(-4)}
                      </div>
                    </td>
                    <td>{position.token?.name} ({position.token?.symbol})</td>
                    <td>{formatLargeNumber(position.deposited)}</td>
                    <td>$ {formatLargeNumber(position.pendingRewards.toFixed(2))}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          position.isCreator ? 'status-open' : 'status-closed'
                        }`}
                      >
                        {position.isCreator ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <ClaimYield mint={position.mint} position_id={position.positionId}/>
                    </td>
                    <td>
                      {position.isCreator ? 
                      <CreatorWithdrawal mint={position.mint} position_id={position.positionId}/> : 
                      <Withdrawal mint={position.mint} position_id={position.positionId}/>
                      }
                      
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

  )
}

export default YieldUsersPosition