import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

function BalanceCheck() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (!publicKey) return;

    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/user/unrealized-pnl/${publicKey}`);
        const data = await res.json();
        setStats(data);
        
      } catch (err) {
        console.error('Error fetching PnL stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [publicKey]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setSolBalance(lamports / 1_000_000_000); // convert lamports → SOL
      } catch (err) {
        console.error("Failed to fetch balance:", err);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10_000);
    return () => clearInterval(interval);
  }, [connected, publicKey, connection]);

  return (
    <div className="dashboard-balance-card">
      <div className="balance-card-sections">
        <h3>Wallet</h3>
        <h2>
          {solBalance !== null && !isNaN(solBalance)
            ? `${solBalance.toFixed(2)} SOL`
            : "Not Connected"}
        </h2>
      </div>
      <div className="balance-card-sections">
        <h3>Unrealized PnL</h3>
        <h2
          className={
            stats?.totalUnrealizedPnL != null
              ? stats.totalUnrealizedPnL > 0
                ? "text-green"
                : "text-red"
              : ""
          }
        >
          {stats?.totalUnrealizedPnL != null
            ? `${stats.totalUnrealizedPnL.toFixed(2)} SOL`
            : "Not Connected"}
        </h2>
      </div>
    </div>
  );
}

export default BalanceCheck;
