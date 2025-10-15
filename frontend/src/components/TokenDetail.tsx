import { useParams } from 'react-router-dom';
import '../styles/TokenDetail.css';
import BuyToken from './trading_components/BuyToken';
import GoShortToken from './trading_components/GoShortToken';
import { useEffect, useState, type JSX } from "react";
import { Globe, Twitter, Send, MessageCircle } from "lucide-react";
import axios from "axios";
import logo_overlay from '../assets/MemeLend - Secondary Logo - 16 July 2025.png';
import { useToast } from "../components/alerts/ToastContainer";
import { formatLargeNumber } from '../utils/numberFormatter';
import PositionsPlaceholder from './chart_layout/PositionsPlaceholder';
import ShortPreview from './trading_components/ShortPreview';
import TradingViewChart from './chart_layout/TradingViewChart';

function TokenDetail() {
  const { mint } = useParams();
  const [token, setToken] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [collateralPercent, setCollateralPercent] = useState(0);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const scaled = (collateralPercent / 50) * 100;

  const getColor = (scaled: number) => {
    if (scaled <= 25) return "#4caf50"; // green
    if (scaled <= 50) return "#ffeb3b"; // yellow
    if (scaled <= 75) return "#ff9800"; // orange
    return "#f44336"; // red
  };

  useEffect(() => {
    if (!mint) {
      setLoading(false);
      return;
    }

    async function fetchToken() {
      try {
        setLoading(true);
        const res = await axios.get(`${apiBase}/token/token-info/${mint}`);
        if (res.data.error) {
          showToast(res.data.error, 'error');
          setToken(null);
        } else {
          // console.log("Token data:", res.data);
          setToken(res.data);
        }
      } catch (err) {
        console.error("Error fetching token info:", err);
        showToast('Failed to fetch token info', 'error');
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    fetchToken();
  }, [mint]);

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
    <div className="token-detail-container">
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="token-chart-section">
            <div className="token-chart-information">
              <div className="token-image-wrapper">
                {token?.image ? (
                  <img
                    src={token.image}
                    alt={token.name}
                    className="token-img"
                  />
                ) : (
                  "—"
                )}
                <img
                  src={logo_overlay}
                  alt="MemeLend logo"
                  className="token-overlay-img"
                />
              </div>

              <div className="token-info-block">
                <div className="token-info-block-header">
                  <p>{token?.name} ({token?.symbol})</p>
                  <p>Volume: {token?.stats?.change24h?.toFixed(2) || '0'}%</p>
                  <p>Liquidity: ${formatLargeNumber(token?.stats?.liquidityUsd || 0)}</p>
                </div>

                {/* Social links */}
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
            </div>
            <div className="token-chart-placeholder">
              <TradingViewChart mint={mint}/>
            </div>
            <div className="token-positions-placeholder">
              <PositionsPlaceholder mint={mint} />
            </div>
          </div>

          <div className="token-sidebar">
            <div className='token-core-information-fields'> 
              <div className='token-core-items-one'>
                <div className='label'>PRICE USD</div>
              </div>
              <div className='token-core-items-one'>
                <div className='label'>PRICE SOL</div>
              </div>
              <div className='token-core-items-one'>
                <div className='content'>
                  ${formatTinyUSD(token?.stats?.currentPriceUsd?.toFixed(10)) || '0'}
                </div>
              </div>
              <div className='token-core-items-one'>
                <div className='content'>
                  {formatTinyUSD(token?.stats?.currentPrice?.toFixed(10)) || '0'} SOL
                </div>
              </div>
            </div>

            <div className='token-core-information-fields-two'> 
              <div className='token-core-items-two'>
                <div className='label'>LIQUIDITY</div>
              </div>
              <div className='token-core-items-two'>
                <div className='label'>FDV</div>
              </div>
              <div className='token-core-items-two'>
                <div className='label'>
                  MKT CAP
                </div>
              </div>
              <div className='token-core-items-two'>
                <div className='content'>
                  ${formatLargeNumber(token?.stats?.liquidityUsd?.toFixed(2)) || '0'}
                </div>
              </div>
              <div className='token-core-items-two'>
                <div className='content'>
                  ${formatLargeNumber(token?.stats?.fdvMarketCapUsd?.toFixed(2)) || '0'}
                </div>
              </div>
              <div className='token-core-items-two'>
                <div className='content'>
                  ${formatLargeNumber(token?.stats?.circulatingMarketCapUsd?.toFixed(2)) || '0'}
                </div>
              </div>
            </div>

            <div className='token-core-information-fields-three'> 
              <div className='token-core-items-three'>
                <div className='label'>5m</div>
              </div>
              <div className='token-core-items-three'>
                <div className='label'>1h</div>
              </div>
              <div className='token-core-items-three'>
                <div className='label'>
                  6h
                </div>
              </div>
              <div className='token-core-items-three'>
                <div className='label'>
                  24h
                </div>
              </div>
              <div className='token-core-items-three'>
                <div className='content'>
                  {token?.stats?.change5m?.toFixed(2) || '0'}%
                </div>
              </div>
              <div className='token-core-items-three'>
                <div className='content'>
                 {token?.stats?.change1h?.toFixed(2) || '0'}%
                </div>
              </div>
              <div className='token-core-items-three'>
                <div className='content'>
                 {token?.stats?.change6h?.toFixed(2) || '0'}%
                </div>
              </div>
              <div className='token-core-items-three'>
                <div className='content'>
                  {token?.stats?.change24h?.toFixed(2) || '0'}%
                </div>
              </div>
            </div>
            <div className='action-logic-frame'>
              <div className='token-core-information-fields'>
                  <div className='token-core-items-one'>
                    <div className='label'>
                      Amount
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='label'>
                      Slippage %
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='content'>
                      <input
                        id="sol-amount-input"
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount of SOL"
                      />
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='content'>
                      <input
                        id="slippage-input"
                        type="number"
                        step="0.1"
                        min="0"
                        value={slippage}
                        onChange={(e) => setSlippage(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
              </div>

              <div className='token-core-information-fields'>
                  <div className='token-core-items-one'>
                    <div className='label'>
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='label'>
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='content'>
                      <BuyToken mint={mint} slippage={slippage} amount={amount}/>
                    </div>
                  </div>
                  <div className='token-core-items-one'>
                    <div className='content'>
                      <GoShortToken mint={mint} slippage={slippage} collateral={amount} collateralPercent={collateralPercent} />
                    </div>
                  </div>
              </div>
              <div className='token-core-collateral-fields'>
                <div className='token-core-collateral-one'>
                    <div className='label'>
                      Short Collateral %
                    </div>
                  </div>
                  <div className='token-core-collateral-one'>
                    <div className='label'>
                      <div className="collateral-slider-container">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="1"
                          value={collateralPercent}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCollateralPercent(val);
                            
                          }}
                          style={{
                            background: getColor(scaled),
                          }}
                          className="collateral-slider"
                        />
                        <div className="collateral-slider-labels">
                          <span>0</span>
                          <span>25</span>
                          <span>50</span>
                          <span>75</span>
                          <span>100</span>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
              <>
              {collateralPercent > 0 ? (
                  <ShortPreview mint={mint} slippage={slippage} collateral={amount} collateralPercent={collateralPercent}/>
                ) : (
                  <div className='token-core-collateral-fields'>
                    <div className='token-core-collateral-one'>
                      <div className='label'>
                        Short Position Calculator
                      </div>
                      <div className='label'>
                        Use this tool to set up and preview short positions
                      </div>
                    </div>
                    
                  </div>
                )}
              </>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TokenDetail;