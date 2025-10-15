import { useEffect, useState } from 'react';
import '../../styles/leaderboard/leaderboard.css';
import { useToast } from "../alerts/ToastContainer";
import axios from 'axios';

interface Meta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function TopReferralEarners() {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    const [positions, setPositions] = useState<any[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [positionsLoading, setPositionsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchNewTokens = async (page: number = 1, pageSize: number = 50) => {
        try {
          setPositionsLoading(true);
          const res = await axios.get(`${apiBase}/leaderboard/top-referral?page=${page}&pageSize=${pageSize}`);
          if (res.data.error) {
            showToast(res.data.error, 'error');
            setPositions([]);
            setMeta(null);
          } else {
            setPositions(res.data.data || []);
            setMeta(res.data.meta || null);
            console.log("Meta", res.data.meta);
          }
        } catch (err) {
          console.error("Error fetching token stats:", err);
          showToast('Failed to fetch token stats', 'error');
          setPositions([]);
          setMeta(null);
        } finally {
          setPositionsLoading(false);
        }
      };
    
      useEffect(() => {
        fetchNewTokens(1, 50);
      }, [apiBase]);
    
  return (
    <div className="leaderboard-table-frame">
        <div className="leaderboard-table-wrapper">
            <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Wallet</th>
                    <th>Referrals</th>
                    <th>Total Earned</th>
                </tr>
            </thead>
                <tbody>
                    {positions.map((position) => {
                        let badge = "";
                        if (position.rank === 1) badge = "🥇";
                        else if (position.rank === 2) badge = "🥈";
                        else if (position.rank === 3) badge = "🥉";

                        return (
                        <tr key={position.rank}>
                            <td>
                            {badge} {position.rank}
                            </td>
                            <td>{position?.username}</td>
                            <td>
                            {position?.wallet}
                            </td>
                            <td>{position?.referralsCount}</td>
                            <td>{(position?.totalEarned ?? 0).toFixed(4)} SOL</td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
        {/* Pagination controls */}
        {meta && (
            <div className="pagination">
                <button
                    disabled={meta.page <= 1}
                    onClick={() => fetchNewTokens(meta.page - 1, meta.pageSize)}
                >
                    ⬅ Prev
                </button>
                <span>
                    Page {meta.page} of {meta.totalPages}
                </span>
                <button
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => fetchNewTokens(meta.page + 1, meta.pageSize)}
                >
                    Next ➡
                </button>
            </div>
        )}
        
    </div>
  )
}

export default TopReferralEarners