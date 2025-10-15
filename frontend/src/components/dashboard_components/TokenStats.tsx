import { useEffect, useState, type JSX } from "react";
import { useWallet } from '@solana/wallet-adapter-react';
import axios from "axios";
import { Link } from 'react-router-dom';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import AddLiquidityModal from "./AddLiquidityModal";
import ClaimEarnings from "./ClaimEarnings";
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';
import '../../styles/dashboard/DashboardTables.css';


function TokenStats() {
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<any | null>(null);
  const { showToast } = useToast();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    async function fetchToken() {
      try {
        setLoading(true);
        const res = await axios.get(`${apiBase}/user/user-token-stats/${publicKey}`);
        if (res.data.error) {
          showToast(res.data.error);
          setPositions([]);
        } else {
        
          setPositions(res.data);
        }
      } catch (err) {
        
        showToast('Failed to fetch token stats');
        setPositions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchToken();
  }, [publicKey, apiBase]);


  const formatTinyUSD = (value: number | null | undefined): JSX.Element | string => {
      if (value == null || !isFinite(value)) {
          return "$0.00"; // fallback when value is missing, null, or Infinity
      }

      if (value >= 0.01) {
          return `$${value.toFixed(8)}`;
      }

      const str = value.toString();
      const decimalPart = str.split('.')[1] || '';
      const match = decimalPart.match(/^(0*)(\d+)/);
      if (!match) return `$${value.toFixed(8)}`;

      const zeroCount = match[1].length;
      const significantDigits = match[2].slice(0, 6);

      return (
          <span className="tiny-usd">
          0.0<sup>{zeroCount}</sup>
          {significantDigits}
          </span>
      );
  };

  return (
    <div className="dashboard-table-frame">
      {positions.length === 0 ? (
        <div className="table-empty-state">
          <p>You don't have any created tokens</p>
          <Link to="/launch" className="empty-state-create-btn">
            ➕ Launch your own token
          </Link>
        </div>
      ) : (
        <div className="dashboard-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Logo</th>
                <th title="Token Mint Address">Mint</th>
                <th>Name</th>
                <th title="Total tokens staked in the yield vault">Staked</th>
                <th title="Available for purchase">Avail</th>
                <th title="Interest pool accumulated for rewards">Pool</th>
                <th title="Current token price (USD)">Price</th>
                <th title="Liquidity value in USD">Liq (USD)</th>
                <th title="Fully Diluted Valuation Market Cap">FDV</th>
                <th title="Circulating Supply Market Cap">Circ MC</th>
                <th title="Total earnings accrued by the token">TotEarn</th>
                <th title="Current earnings accrued by the token">Earnings</th>
                <th title="Add more Liquidity">Add Liq</th>
                <th title="Claim earnings accrued">Claim</th>
              </tr>
            </thead>
            <tbody>
              {positions?.map((position) => (
                <tr key={position?.mint}>
                  <td>
                    <div className="dashboard-image-wrapper">
                    {position?.image ? (
                      <img
                        src={position?.image}
                        alt={position?.name}
                        className="dashboard-token-img"
                      />
                    ) : (
                      '—'
                    )}
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
                      onClick={() => navigator.clipboard.writeText(position?.mint)}
                      title={`Click to copy\n${position?.mint}`}
                    >
                      {position?.mint.slice(0, 4)}...{position?.mint.slice(-4)}
                    </div>
                  </td>
                  <td>{position?.name}({position?.symbol})</td>
                  <td>{formatLargeNumber(position?.totalStaked / Math.pow(10, position?.decimals)).toLocaleString()}</td>
                  <td>{formatLargeNumber(position?.tokenReserve / Math.pow(10, position?.decimals)).toLocaleString()}</td>
                  <td>${(position?.interestVaultUsd)?.toFixed(2)}</td>
                  <td>${formatTinyUSD(position?.stats?.currentPriceUsd?.toFixed(8))}</td>
                  <td>${formatLargeNumber(position?.stats?.liquidityUsd?.toFixed(2))}</td>
                  <td>${formatLargeNumber(position?.stats?.fdvMarketCapUsd?.toFixed(2))}</td>
                  <td>${formatLargeNumber(position?.stats?.circulatingMarketCapUsd?.toFixed(2))}</td>
                  <td>${formatLargeNumber(position?.totalEarnedUsd?.toFixed(2))}</td>
                  <td>${formatLargeNumber(position?.creatorVaultUsd?.toFixed(2))}</td>
                  <td><button className="dashboard-atn-btn" onClick={() => setSelectedToken(position)}>Add Liquidity</button></td>
                  <td><ClaimEarnings mint={position.mint}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedToken && (
        <AddLiquidityModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
}

export default TokenStats;
