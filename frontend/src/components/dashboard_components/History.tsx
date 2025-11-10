import { useEffect, useState, type JSX } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import '../../styles/dashboard/DashboardTables.css';
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';


interface PriceData {
  priceInSol: number;
  priceInUsd: number;
}

function History() {

  const { publicKey } = useWallet();
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  
    const [positions, setPositions] = useState<any[]>([]);
    const [positionsLoading, setPositionsLoading] = useState(true);
    const [prices, setPrices] = useState<Record<string, PriceData>>({});
    const { showToast } = useToast();
  
    useEffect(() => {
      if (!publicKey) return;
  
      const fetchPositions = async () => {
        try {
          const res = await fetch(`${apiBase}/user/history/${publicKey.toString()}`);
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
      const intervalId = setInterval(fetchPositions, 30_000);

      return () => clearInterval(intervalId);
    }, [publicKey]);
  
  
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
          $0.0<sup>{zeroCount}</sup>
          {significantDigits}
          </span>
      );
  };
  

  return (
    <div className="dashboard-table-frame">
      {positions.length === 0 ? (
        <div className="table-empty-state">
          <p>You don't have any position history</p>
          <Link to="/memecoins" className="empty-state-create-btn">
            ➕ Create First Position
          </Link>
        </div>
      ) : (
        <div className="dashboard-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Closing Date</th>
                <th>Logo</th>
                <th>Mint</th>
                <th>Name</th>
                <th title="Entry Price in USD">Entry $</th>
                <th title="Closing Price in USD">Closing $</th>
                <th title="Profit and Loss">PnL</th>
                <th title="Amount of Tokens in Position">Tokens</th>
                <th title="Current Status of Position">Status</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.positionId}>
                  <td>
                    {position?.closeTime
                      ? new Date(position.closeTime).toISOString().split('T')[0]
                      : '-'}
                  </td>
                  <td>
                    <div className="dashboard-image-wrapper">
                      {position?.tokenImage ? (
                        <img
                          src={position?.tokenImage}
                          alt={position?.tokenName}
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
                      title={`Click to copy\n${position.mint}`}
                    >
                      {position?.mint.slice(0, 4)}...{position?.mint.slice(-4)}
                    </div>
                  </td>
                  <td>{position?.tokenName}({position?.tokenSymbol})</td>
                  <td>{position.entryPriceUsd ? 
                        formatTinyUSD(position?.entryPriceUsd) : formatTinyUSD(position?.openPriceUsd)
                      }
                  </td>
                  <td>
                    {position.closePriceUsd ? 
                    formatTinyUSD(position.closePriceUsd)
                    : formatTinyUSD(position.closePriceUsd)
                    }
                  </td>
                  <td>{position.pnlUsd ? 
                        <div className={
                        position.pnlUsd >= 0
                          ?  'text-green' : 'text-red' }>
                        ${position.pnlUsd.toFixed(2)}
                      </div>
                      : 
                      <div className='text-red'>
                        $-{position.forfeitedCollateralUsd.toFixed(2)}
                      </div>
                      }
                      
                  </td>
                  <td>
                    {position.totalTokensOutRaw? 
                      formatLargeNumber(position.totalTokensOutRaw / 1_000_000):
                      formatLargeNumber(position.totalBorrowedLamports / 1_000_000)
                    }
                  </td>
                  <td>
                    <span
                      className={`status-badge status-closed`}
                    >
                      {position.status}
                    </span>
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

export default History
