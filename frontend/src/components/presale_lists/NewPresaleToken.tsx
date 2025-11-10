import { useEffect, useState, type JSX } from 'react';
import axios from 'axios';
import '../../styles/presale/PresaleTokens.css';
import logo_overlay from '../../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import { useToast } from "../alerts/ToastContainer";
import { formatLargeNumber } from '../../utils/numberFormatter';
import { Globe, Twitter, Send, MessageCircle, HelpCircle } from "lucide-react";
import RiskAndRewards from './RiskAndRewards';
import PresaleCountdown from './PresaleCountdown';
import JoinPresaleButton from './JoinPresaleButton';


interface Meta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}


function NewPresaleToken() {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const [tokens, setTokens] = useState<any[]>([]);
      const [meta, setMeta] = useState<Meta | null>(null);
      const [loading, setLoading] = useState(false);
      const [showTerms, setShowTerms] = useState(false);
      const { showToast } = useToast();
    
      const fetchNewTokens = async (page: number = 1, pageSize: number = 10) => {
        try {
          setLoading(true);
          const res = await axios.get(`${apiBase}/tokens/new-presale?page=${page}&pageSize=${pageSize}`);
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
        fetchNewTokens(1, 10);
        const interval = setInterval(() => {
          fetchNewTokens(1, 10);
        }, 15000);

        return () => clearInterval(interval);
      }, [apiBase]);
    
 
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
    <div className="new-presale-token-container">
      <h2>Upcoming Token Presales</h2>
      <button onClick={() => setShowTerms(!showTerms)} className="terms-toggle-button">
        <HelpCircle size={16} />
        <span>
          {showTerms ? 'Hide presale information' : 'What are the risks and rewards of joining a presale?'}
        </span>
      </button>
      <div className='presale-terms-container'style={{ display: showTerms ? 'block' : 'none' }}>
        <RiskAndRewards />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className='new-token-content-container'>
            {tokens.length === 0 ? (
                <p>No tokens found</p>
              ) : (
                tokens.map((token) => (
                  <div
                    key={token.id}
                    className="presale-token-row"
                  >
                    <div className='new-presale-token-image-and-links'>
                      <div className='new-presale-token-image-and-name'>
                        <div className="new-presale-token-image-wrapper">
                          {token.image ? (
                            <img src={token.image} alt={token.name} className="new-presale-token-token-img" />
                          ) : (
                            '—'
                          )}
                          <img
                            src={logo_overlay}
                            alt="MemeLend logo"
                            className="new-presale-token-overlay-img"
                          />
                        </div>
                        <div>{token.name} ({token.symbol})</div>
                      </div>
                      <div className="token-info-icons">
                        {token?.website && (
                          <a href={token.website} target="_blank" rel="noopener noreferrer" title="Website">
                            <Globe size={20} />
                          </a>
                        )}
                        {token?.twitter && (
                          <a href={`${token.twitter}`} target="_blank" rel="noopener noreferrer" title="X">
                            <Twitter size={20} />
                          </a>
                        )}
                        {token?.telegram && (
                          <a href={token.telegram} target="_blank" rel="noopener noreferrer" title="Telegram">
                            <Send size={20} />
                          </a>
                        )}
                        {token?.discord && (
                          <a href={token.discord} target="_blank" rel="noopener noreferrer" title="Discord">
                            <MessageCircle size={20} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className='new-presale-token-status'>
                        <div className='new-presale-token-name-and-age'>
                          <div className='new-presale-token-age-frame'>
                            <label htmlFor="">Age</label> 
                            <div className='new-presale-token-age'>
                              {getTokenAge(token?.createdAt)}
                            </div>
                          </div>
                          <div className='new-presale-current-funds-frame'>
                            <label htmlFor="">Raised (SOL)</label>
                            <div className='new-presale-current-funds'>{token?.presaleSol? token?.presaleSol : 0} SOL</div>
                          </div>
                        </div>
                        <div className='new-presale-token-status-badge'>
                          {(() => {
                            const now = new Date();
                            const start = new Date(token.presaleStart);
                            const end = new Date(token.presaleEnd);

                            let statusText = "Pending";
                            let statusClass = "presale-status-pending";

                            if (now >= start && now <= end) {
                              statusText = "Live";
                              statusClass = "presale-status-open";
                            } else if (now > end) {
                              statusText = "Expired";
                              statusClass = "presale-status-closed";
                            }

                            return (
                              <span className={`presale-status-badge ${statusClass}`}>
                                {statusText}
                              </span>
                            );
                          })()}
                        </div>
                    </div>
                    <div className='new-presale-token-stats-bar-container'>
                      {(() => {
                        const total = Number(token?.presaleAmount || 0);
                        const left = Number(token?.presaleAmountLeftOver || 0);
                        const sold = total - left;
                        const progress = total > 0 ? (sold / total) * 100 : 0;

                        return (
                          <>
                            <div className="new-presale-token-stats-background-bar">
                              <div
                                className="new-presale-token-stats-background-bar-progress"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="new-presale-token-stats-bar-label">
                              <span>
                                {formatLargeNumber(sold / Math.pow(10, token?.decimals))} / {formatLargeNumber(total / Math.pow(10, token?.decimals))} Tokens Sold
                              </span>
                              <span>{progress.toFixed(1)}%</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className='new-presale-token-details-and-actions'>
                      <div className='new-presale-token-details'>
                        <div className='token-detail-item'>
                          <label>Creator Allocation</label>
                          <div>{formatLargeNumber(token?.lendAmount / Math.pow(10, token?.decimals)).toLocaleString()}</div>
                        </div>
                        <div className='token-detail-item'>
                          <label>Launch Supply</label>
                          <div>{formatLargeNumber(token?.liquidityAmount/ Math.pow(10, token?.decimals)).toLocaleString()}</div>
                        </div>
                        <div className='token-detail-item'>
                          <label>Presale Fee Pool</label>
                          <div>0.25%</div>
                        </div>
                        <div className='token-detail-item'>
                          <label>Presale Entry Price</label>
                          <div>{formatTinyUSD(token.currentPriceUsd)}</div>
                        </div>
                      </div>
                      <div className='new-presale-token-join-presale-and-timer-frame'>
                        <div className='new-presale-join-presale-button'>
                          <JoinPresaleButton mint={token.mint} presaleStart={token.presaleStart} presaleEnd={token.presaleEnd}/>
                        </div>
                        <div className='new-presale-token-timer-frame'>
                          <PresaleCountdown start={token.presaleStart} end={token.presaleEnd} />
                        </div>
                      </div>
                    </div>
                    
                  </div>
                ))
              )}
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
        </>
      )}
    </div>
  )
}

export default NewPresaleToken