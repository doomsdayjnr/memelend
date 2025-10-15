import { useEffect, useState, type JSX } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../../styles/NewCreatedToken.css';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';


interface Meta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function TrendingTokens() {

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const [tokens, setTokens] = useState<any[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { showToast } = useToast();

    const fetchNewTokens = async (page: number = 1, pageSize: number = 5) => {
        try {
        setLoading(true);
        const res = await axios.get(`${apiBase}/tokens/trending?page=${page}&pageSize=${pageSize}`);
        if (res.data.error) {
            showToast(res.data.error, 'error');
            setTokens([]);
            setMeta(null);
        } else {
            setTokens(res.data.data || []);
            setMeta(res.data.meta || null);
        }
        } catch (err) {
        console.error("Error fetching token stats:", err);
        showToast('Failed to fetch token stats', 'error');
        setTokens([]);
        setMeta(null);
        } finally {
        setLoading(false);
        }
    };

    useEffect(() => {
        fetchNewTokens(1, 5);
    }, [apiBase]);

    const handleRowClick = (mint: string) => {
        navigate(`/memecoins/token/${mint}`);
    };

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

    const formatTinyUSD = (value: number): JSX.Element | string => {
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
            $0.0<sup>{zeroCount}</sup>{significantDigits}
        </span>
        );
    };

  return (
    <div className="new-token-container">
      <h2>🔥 Trending</h2>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="new-token-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Name</th>
                <th>Mint</th>
                <th>Age</th>
                <th title="Current token price (USD)">Price</th>
                <th title="Fully Diluted Valuation Market Cap">FDV</th>
                <th title="Circulating Supply Market Cap">Circ MC</th>
                <th title="Liquidity value in USD">Liq (USD)</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr><td colSpan={8}>No tokens found</td></tr>
              ) : (
                tokens.map((token) => (
                  <tr
                    key={token.id}
                    className="clickable-row"
                    onClick={() => handleRowClick(token.mint)}
                  >
                    <td>
                      <div className="new-token-image-wrapper">
                        {token.image ? (
                          <img src={token.image} alt={token.name} className="new-token-token-img" />
                        ) : (
                          '—'
                        )}
                        <img
                          src={logo_overlay}
                          alt="MemeLend logo"
                          className="new-token-overlay-img"
                        />
                      </div>
                    </td>
                    <td>{token.name} ({token.symbol})</td>
                    <td className="truncate-mint">
                      {token.mint?.length >= 8
                        ? `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`
                        : token.mint}
                    </td>
                    <td>{getTokenAge(token.createdAt)}</td>
                    <td>
                      {token.currentPriceUsd !== undefined
                        ? formatTinyUSD(token.currentPriceUsd.toFixed(10))
                        : '—'}
                    </td>
                    <td>{formatLargeNumber(token.fdvMarketCapUsd) !== undefined ? `$${formatLargeNumber(token.fdvMarketCapUsd.toFixed(2))}` : '—'}</td>
                    <td>{formatLargeNumber(token.circulatingMarketCapUsd) !== undefined ? `$${formatLargeNumber(token.circulatingMarketCapUsd.toFixed(2))}` : '—'}</td>
                    <td>{formatLargeNumber(token.liquidityUsd) !== undefined ? `$${formatLargeNumber(token.liquidityUsd.toFixed(2))}` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

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
        </>
      )}
    </div>
  )
}

export default TrendingTokens