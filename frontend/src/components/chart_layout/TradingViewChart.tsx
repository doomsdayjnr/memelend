import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

interface CandleResponse {
  mint: string;
  interval: string;
  startTime: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  txCount: number;
  source?: 'db' | 'live';
}

function msFor(interval: string): number {
  switch (interval) {
    case '1s': return 1000;
    case '1m': return 60000;
    case '5m': return 300000;
    case '15m': return 900000;
    case '1h': return 3600000;
    case '4h': return 14400000;
    case '8h': return 28800000;
    case '12h': return 43200000;
    case '24h': return 86400000;
    default: return 1000;
  }
}

function TradingViewChart({ mint }: { mint: string | undefined }) {
  const [interval, setInterval] = useState('1s');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<CandleResponse[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const updateIntervalRef = useRef<number | null>(null);
  const currentIntervalRef = useRef(interval);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8081';
  const MAX_CANDLES = 2000;
  const INTERVALS = ['1s', '1m', '5m', '15m', '1h', '4h', '8h', '12h', '24h'];

  const mapToChartCandle = useCallback((c: CandleResponse) => ({
    time: (Date.UTC(
      new Date(c.startTime).getUTCFullYear(),
      new Date(c.startTime).getUTCMonth(),
      new Date(c.startTime).getUTCDate(),
      new Date(c.startTime).getUTCHours(),
      new Date(c.startTime).getUTCMinutes(),
      new Date(c.startTime).getUTCSeconds()
    ) / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }), []);

  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current || !mint) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: { background: { color: '#0D1117' }, textColor: '#E5E7EB' },
      grid: { vertLines: { color: '#1e1e1e' }, horzLines: { color: '#1e1e1e' } },
      timeScale: { timeVisible: true, secondsVisible: currentIntervalRef.current === '1s', rightOffset: 12 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderVisible: true,
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickVisible: true,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: 9, minMove: 0.000000001 }, // always USD
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    return chart;
  }, [mint]);

  const fetchInitialData = useCallback(async (normalizedInterval: string) => {
    if (!mint) return;
    try {
      setIsLoading(true);
      setError(null);

      const resp = await fetch(`${apiBase}/chart/candles?mint=${mint}&interval=${normalizedInterval}&limit=1000`);
      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
      const raw: CandleResponse[] = await resp.json();

      console.log(raw); 

      candlesRef.current = raw.slice(-MAX_CANDLES);
      const chartData = candlesRef.current.map(mapToChartCandle);
      if (seriesRef.current) seriesRef.current.setData(chartData);

      setIsLoading(false);

      if (updateIntervalRef.current !== null) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      
    } catch (err) {
      console.error('Could not load initial candles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chart data');
      setIsLoading(false);
    }
  }, [mint, apiBase, mapToChartCandle]);

  const handleIntervalChange = useCallback((newInterval: string) => {
    if (!mint) return;

    if (seriesRef.current) seriesRef.current.setData([]);
    candlesRef.current = [];

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', mint, interval: currentIntervalRef.current }));
    }

    setInterval(newInterval);
    currentIntervalRef.current = newInterval;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', mint, interval: newInterval }));
    }

    fetchInitialData(newInterval);
  }, [mint, fetchInitialData]);

  const connectWebSocket = useCallback(() => {
    if (!mint) return () => {};

    let closedByUs = false;

    const connect = () => {
      if (closedByUs || !mint) return;
      if (wsRef.current) wsRef.current.close();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'subscribe', mint, interval: currentIntervalRef.current }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'kline') {
            const candleData: CandleResponse = msg.data;
            if (!candleData.startTime || candleData.mint !== mint) return;
            if (candleData.interval !== currentIntervalRef.current) return;

            const lwCandle = mapToChartCandle(candleData);
            const candles = [...candlesRef.current];
            const lastIndex = candles.length - 1;

            if (candles.length && new Date(candles[lastIndex].startTime).getTime() === new Date(candleData.startTime).getTime()) {
              candles[lastIndex] = candleData;
              seriesRef.current?.update(lwCandle);
            } else {
              candles.push(candleData);
              if (candles.length > MAX_CANDLES) candles.shift();
              seriesRef.current?.setData(candles.map(mapToChartCandle));
            }
            candlesRef.current = candles;
          }
        } catch (err) {
          console.error('WS message parse error', err);
        }
      };

      ws.onerror = (err) => { console.error('WebSocket error:', err); setIsConnected(false); };
      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!closedByUs && reconnectTimeoutRef.current === null) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 1000);
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [mint, mapToChartCandle]);

  useEffect(() => { currentIntervalRef.current = interval; }, [interval]);

  useEffect(() => {
    if (!chartContainerRef.current || !mint) return;

    const chart = initializeChart();
    if (!chart) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    fetchInitialData(currentIntervalRef.current);
    const cleanupWs = connectWebSocket();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (updateIntervalRef.current !== null) window.clearInterval(updateIntervalRef.current);
      cleanupWs();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      candlesRef.current = [];
    };
  }, [mint, initializeChart, fetchInitialData, connectWebSocket]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Interval buttons */}
      <div style={{ marginBottom: 8 }}>
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => handleIntervalChange(i)}
            style={{
              marginRight: 6,
              padding: '4px 12px',
              cursor: 'pointer',
              backgroundColor: interval === i ? '#26a69a' : '#555',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            {i.toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#E5E7EB', backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '12px 20px', borderRadius: 8, zIndex: 10
        }}>Loading chart data...</div>
      )}

      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#EF4444', backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '12px 20px', borderRadius: 8, zIndex: 10, textAlign: 'center'
        }}>
          {error}<br/>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '4px 12px',
              backgroundColor: '#26a69a', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer'
            }}>Retry</button>
        </div>
      )}

      <div ref={chartContainerRef} style={{ width: '100%', height: '100%', opacity: isLoading || error ? 0.5 : 1 }} />

      <div style={{
        position: 'absolute', right: 8, top: 8,
        color: isConnected ? '#10B981' : '#EF4444',
        fontSize: 12, backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '4px 8px', borderRadius: 4, zIndex: 5
      }}>
        {isConnected ? '🟢 Live' : '🔴 Disconnected'}
      </div>
    </div>
  );
}

export default TradingViewChart;
