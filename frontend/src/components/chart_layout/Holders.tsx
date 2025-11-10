import { useEffect, useState, type JSX } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import logo_overlay from "../../assets/MemeLend - Secondary Logo - 16 July 2025.png";
import "../../styles/chart/PositionsPlaceholder.css";
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from "../../utils/numberFormatter";


function Holders({ mint }: any) {
  const { publicKey } = useWallet();
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [holders, setHolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (!publicKey) return;

    const fetchHolders = async () => {
      try {
        const res = await fetch(`${apiBase}/positions/holders/${mint.toString()}`);
        if (!res.ok) {
          showToast("Failed to fetch holders", "error");
          return;
        }
        const data = await res.json();
        setHolders(data);
      } catch (err) {
        showToast("Failed to load holders", "error");
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchHolders();
    const intervalId = setInterval(fetchHolders, 30_000);

    return () => clearInterval(intervalId);
  }, [publicKey]);

  

  useEffect(() => {
    const fetchPrice = async () => {
      const res = await fetch(`${apiBase}/token/price/${mint.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentPrice(data.currentPriceUsd);
    };
    fetchPrice();
  }, [mint]);

  return (
    <div className="chart-dashboard">
      {loading ? (
        <div className="chart-dashboard-empty-state">
          <p>Loading holders...</p>
        </div>
      ) : holders.length === 0 ? (
        <div className="chart-dashboard-empty-state">
          <p>No holders found</p>
        </div>
      ) : (
        <div className="chart-dashboard-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Creator</th>
                <th>Balance</th>
                <th>Value</th>
                <th>% Of Supply</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((holder) => (
                <tr key={`${holder.wallet}-${holder.mint}`}>
                  <td>{holder.rank}</td>
                  <td>
                    {holder.wallet.slice(0, 4)}...
                    {holder.wallet.slice(-4)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        holder.isCreator ? 'status-open' : 'status-closed'
                      }`}
                    >
                      {holder.isCreator ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>{formatLargeNumber(holder.totalTokens / 1_000_000)}</td>
                  <td>${((holder.totalTokens / 1_000_000) * currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2} )}</td>
                  <td>{(holder.pctOfSupply).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Holders;
