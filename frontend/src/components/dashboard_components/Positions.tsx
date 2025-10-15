import { useEffect, useState, type JSX } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import CloseToken from '../trading_components/CloseToken';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import '../../styles/dashboard/DashboardTables.css';
import SellToken from '../trading_components/SellToken';
import DepositYield from './DepositYield';
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';


interface PriceData {
  priceInSol: number;
  priceInUsd: number;
}

function Positions() {
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
        const res = await fetch(`${apiBase}/positions/positions/${publicKey.toString()}`);
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

  useEffect(() => {
    if (positions.length === 0) return;

    const fetchPrices = async () => {
      try {
        // collect all unique mints from positions
        const mints = Array.from(new Set(positions.map((p) => p.mint)));

        // call new batch price endpoint
        const res = await fetch(`${apiBase}/token/price?mints=${mints.join(',')}`);
        if (!res.ok) {
          showToast('Failed to fetch prices', 'error');
          return;
        }

        const data = await res.json();
        const newPrices: Record<string, PriceData> = {};

        // normalize results into map for fast lookup
        data.prices.forEach((priceObj: any) => {
          if (!priceObj.error) {
            newPrices[priceObj.mint] = {
              priceInSol: priceObj.priceInSol,
              priceInUsd: priceObj.priceInUsd,
            };
          }
        });

        setPrices(newPrices);
      } catch (err) {
        showToast('Failed to load prices', 'error');
      }
    };

    fetchPrices();

    // refresh every 30s
    const intervalId = setInterval(fetchPrices, 30_000);
    return () => clearInterval(intervalId);
  }, [positions]);

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


  const calculatePnL = (entryPrice: number, currentPrice: number, side: string): JSX.Element => {

    if (entryPrice === 0) {
      return (
        <div className="flex flex-col">
          <span>∞%</span> {/* or "N/A" if you prefer */}
        </div>
      );
    }else{
      const pnlDollar = side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
      const pnlPercent = (pnlDollar / entryPrice) * 100;
    

      return (
        <div className="flex flex-col">
          {/* <span>{formatTinyUSD(pnlDollar)}</span> */}
          <span>{pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</span>
        </div>
      );
    }
    
};

  return (
    <div className="dashboard-table-frame">
      {positions.length === 0 ? (
        <div className="table-empty-state">
          <p>You don't have any open positions yet</p>
          <Link to="/memecoins" className="empty-state-create-btn">
            ➕ Buy your first token
          </Link>
        </div>
      ) : (
        <div className="dashboard-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Logo</th>
                <th title="Token Name or Logo">Token</th>
                <th title="Token Type (e.g., Meme, Utility)">Type</th>
                <th title="Entry Price in USD">Entry $</th>
                <th title="Liquidation Price in USD">Liq $</th>
                <th title="Profit and Loss">PnL</th>
                <th title="Amount of Tokens in Position">Tokens</th>
                <th title="Current Status of Position">Status</th>
                <th title="Close the Position">Close Position</th>
                <th title="Stake Tokens">Stake</th>
                <th title="Transaction Signature">TX</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.positionId}>
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
                  <td>{position.side}</td>
                  <td>{formatTinyUSD(position.entryPrice)}</td>
                  <td>
                    {position.side === 'short' ? formatTinyUSD(position.liquidate) : '—'}
                  </td>
                  <td>
                    {prices[position.mint] ? (
                      <div className={
                        position.side === 'buy'
                          ? prices[position.mint].priceInUsd >= position.entryPrice
                            ? 'text-green'  // Profit for long
                            : 'text-red'    // Loss for long
                          : prices[position.mint].priceInUsd >= position.entryPrice
                            ? 'text-red'    // Loss for short
                            : 'text-green'  // Profit for short
                      }>
                        {calculatePnL(position.entryPrice, prices[position.mint].priceInUsd, position.side)}
                      </div>
                    ) : (
                      'Loading...'
                    )}
                  </td>
                  <td>
                    {formatLargeNumber(position.tokensOut / 1_000_000)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        position.isOpen ? 'status-open' : 'status-closed'
                      }`}
                    >
                      {position.isOpen ? 'Open' : 'Closed'}
                    </span>
                  </td>
                  <td>
                    {position.side === 'short' ? 
                    <CloseToken mint={position.mint} position_id={position.positionId} /> : 
                    <SellToken mint={position.mint} position_id={position.positionId} />}
                  </td>
                  <td>
                    {position.side === 'short' ? 
                    "-": 
                    <DepositYield mint={position.mint} position_id={position.positionId}/>}
                  </td>
                  <td>
                    {position.openTxSig ? (
                      <a
                        href={`https://solscan.io/tx/${position.openTxSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on Solscan"
                        className='tx-icon'
                      >
                        🔗
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Positions;
