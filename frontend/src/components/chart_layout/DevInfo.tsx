import { useEffect, useState } from "react";
import "../../styles/chart/DevInfo.css";
import { formatLargeNumber } from '../../utils/numberFormatter';



function DevInfo({ mint }: { mint: string }) {
  const [data, setData] = useState<any | null>(null);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${apiBase}/token/dev-info/${mint}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch dev info", err);
      }
    };
    fetchData();
  }, [mint]);

  const getTokenAge = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const diff = now - created;

    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (!data) return <div className="dev-info-container">Loading...</div>;


  return (
    <div className="dev-info-container">
      <h3 className="title">Dev & Holder Insights</h3>

      <h3 className="subtitle">Transparency into dev holdings, liquidity added, and community stake.</h3>
      
      <div className="stats-grid">
        <div className="stat-card">
          ⏱️ Token Age: {getTokenAge(data.createdAt)}
        </div>
        <div className="stat-card">
          📦 Available: {formatLargeNumber((data.supplyAvailable / 1e6).toFixed(2))}
        </div>
        <div className="stat-card highlight-blue">
          💧 Liquidity Added: ${formatLargeNumber(data.liquidityAddedUsd.toFixed(2))}
          <div className="stat-sub">
            {data.lastLiquidityAdded
              ? `Last: ${new Date(data.lastLiquidityAdded).toLocaleDateString()}`
              : "No recent add"}
          </div>
        </div>

        <div className="stat-card highlight-red">
          📉 Insider Sold: {formatLargeNumber((data.insiderSold / 1e6).toFixed(2))}
          <div className="stat-sub">
            {data.lastSold
              ? `Last: ${new Date(data.lastSold).toLocaleDateString()}`
              : "No recent sell"}
          </div>
        </div>
        <div className="stat-card highlight-blue">
          📈 Insider Bought: {formatLargeNumber((data.insiderBought / 1e6).toFixed(2))}
          <div className="stat-sub">
            {data.lastBought
              ? `Last: ${new Date(data.lastBought).toLocaleDateString()}`
              : "No recent buy"}
          </div>
        </div>

        <div className="stat-card highlight-green">
          💰 Fees Earned: ${formatLargeNumber(data.totalEarnedUsd.toFixed(2))}
        </div>

        <div className="stat-card">
          🔒 Staked: {formatLargeNumber((data.totalStaked / 1e6).toFixed(2))}
        </div>

        <div className="stat-card">
          👨 Dev Holding: {formatLargeNumber((data.totalDevHoldings / 1e6).toFixed(2))}
        </div>

        <div className="stat-card">
          🌍 Community Staked: {formatLargeNumber((data.communityStaked / 1e6).toFixed(2))}
        </div>
        <div className="stat-card">
          🧑‍💻 Dev Supply Share: {data.shareOfSupply}%
        </div>

        <div className="stat-card">
          📊 Buy/Sell Ratio: {data.buySellRatio.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

export default DevInfo;
