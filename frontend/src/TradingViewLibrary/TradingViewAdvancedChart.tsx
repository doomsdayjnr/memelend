import { useEffect, useRef, useCallback, useState } from 'react';
import {
  widget,
  type ChartingLibraryWidgetOptions,
  type LanguageCode,
  type ResolutionString,
  type IChartingLibraryWidget,
  type IBasicDataFeed,
  type IDatafeedChartApi,
  type IExternalDatafeed,
  type IDatafeedQuotesApi,
  type SearchSymbolsCallback,
  type ResolveCallback,
  type SubscribeBarsCallback,
  type Bar,
  type LibrarySymbolInfo,
  type QuoteData,
  type QuotesCallback,
} from '../charting_library';

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

interface TradingViewChartProps {
  mint: string | undefined;
  symbol: string | undefined;
}

// Custom DataFeed implementation for live data
class LiveDataFeed implements IDatafeedChartApi, IExternalDatafeed, IDatafeedQuotesApi {
  private subscribers = new Map<string, SubscribeBarsCallback>();
  private ws: WebSocket | null = null;
  private mint: string;
  private currentInterval: string;
  private readonly wsUrl: string;
  private isDestroyed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(mint: string, interval: string) {
    this.mint = mint;
    this.currentInterval = interval;
    this.wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8081';
    this.connectWebSocket();
  }

  // In LiveDataFeed class, update the interval mapping methods:

  private mapTradingViewInterval(tvInterval: string): string {
    switch (tvInterval) {
      case '1S': return '1s';
      case '1': return '1m';      
      case '5': return '5m';      
      case '15': return '15m';
      case '60': return '1h';
      case '240': return '4h';
      case '480': return '8h';
      case '720': return '12h';
      case '1D': return '24h';
      case 'D': return '24h';
      default: return '1m';
    }
  }

  private mapToBackendInterval(interval: string): string {
    switch (interval) {
      case '1s': return '1S';
      case '1m': return '1';    
      case '5m': return '5';      
      case '15m': return '15';
      case '1h': return '60';
      case '4h': return '240';
      case '8h': return '480';
      case '12h': return '720';
      case '24h': return '1D';
      default: return '1';
    }
  }

  private connectWebSocket() {
    if (this.isDestroyed) return;
    
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close existing connection if it exists
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        if (this.isDestroyed) {
          this.ws?.close();
          return;
        }
        console.log('WebSocket connected for TradingView datafeed');
        const mappedInterval = this.mapTradingViewInterval(this.currentInterval);
        this.ws?.send(JSON.stringify({ 
          type: 'subscribe', 
          mint: this.mint, 
          interval: mappedInterval 
        }));
      };

      // In WebSocket onmessage handler in LiveDataFeed:
      this.ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        
        try {
          const msg = JSON.parse(event.data);
          console.log('📨 WebSocket message type:', msg.type);
          
          // Handle both message structures
          let candleData: CandleResponse;
          if (msg.type === 'kline' && msg.data) {
            candleData = msg.data;
          } else if (msg.type === 'kline' && !msg.data) {
            // Sometimes the data might be directly in the message
            candleData = msg as any;
          } else {
            return; // Not a kline message
          }
          
          console.log('🕵️‍♂️ Processing candle:', {
            mint: candleData.mint,
            interval: candleData.interval,
            time: candleData.startTime
          });
          
          // Map the interval from backend format to TradingView format
          const tvInterval = this.mapToBackendInterval(candleData.interval);
          
          console.log('🔄 Interval check:', {
            backend: candleData.interval,
            tradingView: tvInterval,
            current: this.currentInterval,
            matches: tvInterval === this.currentInterval,
            mintMatches: candleData.mint === this.mint
          });
          
          if (candleData.mint === this.mint && tvInterval === this.currentInterval) {
            const tvBar = this.mapToTradingViewBar(candleData);
            
            console.log('✅ Sending bar to subscribers:', {
              time: tvBar.time,
              open: tvBar.open,
              close: tvBar.close,
              subscriberCount: this.subscribers.size
            });
            
            // Notify all subscribers
            this.subscribers.forEach((callback, key) => {
              try {
                console.log(`📤 Notifying subscriber: ${key}`);
                callback(tvBar);
              } catch (error) {
                console.error('Error in subscriber callback:', error);
              }
            });
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        console.log('WebSocket disconnected, attempting reconnect...');
        this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (!this.isDestroyed) {
        this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 3000);
      }
    }
  }

  private mapToTradingViewBar(candle: CandleResponse): Bar {
    return {
      time: new Date(candle.startTime).getTime(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    };
  }

  // IDatafeedChartApi methods
  public async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: { from: number; to: number; countBack?: number; firstDataRequest?: boolean },
    onResult: (bars: Bar[], meta: { noData?: boolean }) => void
  ): Promise<void> {
    // Only fetch data on first request to prevent loops
    if (!periodParams.firstDataRequest) {
      onResult([], {});
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const mappedInterval = this.mapTradingViewInterval(resolution);
      
      // console.log('🔍 Fetching historical data:', { 
      //   mint: this.mint, 
      //   resolution, 
      //   mappedInterval,
      //   firstDataRequest: periodParams.firstDataRequest 
      // });
      
      const response = await fetch(
        `${apiBase}/chart/candles?mint=${this.mint}&interval=${mappedInterval}&limit=1000`
      );
      
      if (!response.ok) {
        console.error(`HTTP error: ${response.status}`);
        throw new Error(`Failed to fetch historical data: ${response.status}`);
      }
      
      const rawData: CandleResponse[] = await response.json();
      
      console.log('📊 Historical data loaded:', { 
        count: rawData?.length,
        mint: this.mint, 
        sample: rawData.slice(0, 3)
      });
      
      if (!rawData || rawData.length === 0) {
        console.warn('No historical data found');
        onResult([], { noData: true });
        return;
      }

      const bars = rawData
        .filter(candle => candle && candle.startTime && candle.mint === this.mint)
        .map(candle => this.mapToTradingViewBar(candle))
        .sort((a, b) => a.time - b.time);
      
      // console.log('✅ Processed bars for chart:', bars.length);
      onResult(bars, { noData: !bars.length });
      
    } catch (error) {
      console.error('❌ Error in getBars:', error);
      onResult([], { noData: true });
    }
  }

  public subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    onResetCacheNeededCallback: () => void
  ): void {
    this.subscribers.set(listenerGuid, onTick);
  }

  public unsubscribeBars(listenerGuid: string): void {
    this.subscribers.delete(listenerGuid);
  }

  public async resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: (symbolInfo: LibrarySymbolInfo) => void,
    onResolveErrorCallback: (error: string) => void
  ): Promise<void> {
    // Wrap in setTimeout to make it properly asynchronous as required by TradingView
    setTimeout(() => {
      try {
        const symbolInfo: LibrarySymbolInfo = {
          name: symbolName,
          full_name: symbolName,
          description: symbolName,
          type: 'crypto',
          session: '24x7',
          exchange: 'MemeLend',
          listed_exchange: 'MemeLend',
          timezone: 'Etc/UTC',
          format: 'price',
          pricescale: 1000000000,
          minmov: 1,
          volume_precision: 2,
          has_intraday: true,
          has_daily: true,
          has_weekly_and_monthly: false,
          supported_resolutions: ['1S', '1', '5', '15', '60', '240', '480', '720', 'D'] as ResolutionString[],
          data_status: 'streaming',
          ticker: symbolName,
          visible_plots_set: 'ohlcv',
        } as LibrarySymbolInfo;
        
        onSymbolResolvedCallback(symbolInfo);
      } catch (error) {
        onResolveErrorCallback('Failed to resolve symbol');
      }
    }, 0);
  }

  public async searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: SearchSymbolsCallback
  ): Promise<void> {
    onResult([]);
  }

  // IExternalDatafeed methods
  public onReady(callback: (configuration: any) => void): void {
    setTimeout(() => {
      callback({
        supports_search: false,
        supports_group_request: false,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
        supported_resolutions: ['1S', '1', '5', '15', '60', '240', '480', '720', 'D'] as ResolutionString[],
      });
    }, 0);
  }

  // IDatafeedQuotesApi methods
  public subscribeQuotes(
    symbols: string[],
    fastSymbols: string[],
    onRealtimeCallback: QuotesCallback,
    listenerGUID: string
  ): void {
    console.log('subscribeQuotes not implemented for symbols:', symbols, fastSymbols);
  }

  public unsubscribeQuotes(listenerGUID: string): void {
    console.log('unsubscribeQuotes not implemented');
  }

  public getQuotes(
    symbols: string[],
    onDataCallback: (data: QuoteData[]) => void,
    onErrorCallback: (error: string) => void
  ): void {
    console.log('getQuotes not implemented for symbols:', symbols);
    onErrorCallback('Quotes not supported - this datafeed only provides OHLCV data');
  }

  public getServerTime(callback: (serverTime: number) => void): void {
    callback(Math.floor(Date.now() / 1000));
  }

  public updateMint(newMint: string) {
    if (this.mint !== newMint) {
      // Unsubscribe from old mint
      if (this.ws?.readyState === WebSocket.OPEN && !this.isDestroyed) {
        const mappedInterval = this.mapTradingViewInterval(this.currentInterval);
        this.ws.send(JSON.stringify({ 
          type: 'unsubscribe', 
          mint: this.mint, 
          interval: mappedInterval 
        }));
      }
      
      this.mint = newMint;
      
      // Subscribe to new mint
      if (this.ws?.readyState === WebSocket.OPEN && !this.isDestroyed) {
        const mappedInterval = this.mapTradingViewInterval(this.currentInterval);
        this.ws.send(JSON.stringify({ 
          type: 'subscribe', 
          mint: newMint, 
          interval: mappedInterval 
        }));
      }
    }
  }

  public updateInterval(newInterval: string) {
    if (this.currentInterval !== newInterval) {
      // Unsubscribe from old interval
      if (this.ws?.readyState === WebSocket.OPEN && !this.isDestroyed) {
        const oldMappedInterval = this.mapTradingViewInterval(this.currentInterval);
        this.ws.send(JSON.stringify({ 
          type: 'unsubscribe', 
          mint: this.mint, 
          interval: oldMappedInterval 
        }));
      }
      
      this.currentInterval = newInterval;
      
      // Subscribe to new interval
      if (this.ws?.readyState === WebSocket.OPEN && !this.isDestroyed) {
        const newMappedInterval = this.mapTradingViewInterval(newInterval);
        this.ws.send(JSON.stringify({ 
          type: 'subscribe', 
          mint: this.mint, 
          interval: newMappedInterval 
        }));
      }
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.subscribers.clear();
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        const mappedInterval = this.mapTradingViewInterval(this.currentInterval);
        this.ws.send(JSON.stringify({ 
          type: 'unsubscribe', 
          mint: this.mint, 
          interval: mappedInterval 
        }));
      }
      this.ws.close();
      this.ws = null;
    }
  }
}

function TradingViewAdvancedChart({ mint, symbol }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const dataFeedRef = useRef<LiveDataFeed | null>(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const defaultProps = {
    symbol: symbol || 'SOL/USDC',
    interval: '1' as ResolutionString,
    datafeedUrl: '',
    libraryPath: '/charting_library/',
    fullscreen: false,
    autosize: true,
    studiesOverrides: {},
  };

  const getLanguageFromURL = (): LanguageCode | null => {
    const regex = new RegExp('[\\?&]lang=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' ')) as LanguageCode;
  };

  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current || !mint) {
      setError('No mint provided or chart container not found');
      setIsLoading(false);
      return;
    }

    try {
      // Clean up previous instance
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }

      if (dataFeedRef.current) {
        dataFeedRef.current.destroy();
        dataFeedRef.current = null;
      }

      setIsWidgetReady(false);
      setError(null);
      setIsLoading(true);

      // Create new datafeed instance
      dataFeedRef.current = new LiveDataFeed(mint, defaultProps.interval);

      const widgetOptions: ChartingLibraryWidgetOptions = {
        symbol: symbol,
        datafeed: dataFeedRef.current,
        interval: defaultProps.interval,
        container: chartContainerRef.current,
        library_path: defaultProps.libraryPath,
        locale: getLanguageFromURL() || 'en',
        
        // Use correct feature flags
        disabled_features: [
          'use_localstorage_for_settings',
          'save_chart_properties_to_local_storage',
          'header_compare',
          'header_screenshot', 
          'header_undo_redo',
          'header_symbol_search',
          'popup_hints',
          'study_templates'
        ],
        
        charts_storage_url: undefined,
        charts_storage_api_version: undefined,
        client_id: undefined,
        user_id: undefined,
        
        fullscreen: defaultProps.fullscreen,
        autosize: defaultProps.autosize,
        studies_overrides: defaultProps.studiesOverrides,
        timeframe: '1D',
        
        // Simplify time frames
        time_frames: [
          { text: "1D", resolution: "1" as ResolutionString },
          { text: "5D", resolution: "5" as ResolutionString },
          { text: "1M", resolution: "60" as ResolutionString },
          { text: "3M", resolution: "60" as ResolutionString },
          { text: "6M", resolution: "240" as ResolutionString },
          { text: "1Y", resolution: "1D" as ResolutionString },
        ],
        
        loading_screen: { backgroundColor: '#0D1117' },
        theme: "dark",
        overrides: {
          'paneProperties.background': '#0D1117',
          'paneProperties.vertGridProperties.color': '#1e1e1e',
          'paneProperties.horzGridProperties.color': '#1e1e1e',
          'mainSeriesProperties.candleStyle.upColor': '#26a69a',
          'mainSeriesProperties.candleStyle.downColor': '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
        }
      };
      widgetRef.current = new widget(widgetOptions);

      widgetRef.current.onChartReady(() => {
        console.log('TradingView chart is ready with live data');
        setIsWidgetReady(true);
        setIsLoading(false);
        
        // Add live indicator button
        widgetRef.current?.headerReady().then(() => {
          const button = widgetRef.current?.createButton();
          if (button) {
            button.setAttribute('title', 'Live Data Connected');
            button.classList.add('apply-common-tooltip');
            button.innerHTML = '📡 Live';
            button.style.cssText = 'color: #00D632; font-weight: bold; cursor: default;';
          }
        });
      });

    } catch (error) {
      console.error('Error initializing TradingView widget:', error);
      setError(`Failed to initialize chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  }, [mint]);

  useEffect(() => {
    if (mint) {
      initializeChart();
    }

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (e) {
          console.error('Error removing widget:', e);
        }
        widgetRef.current = null;
      }
      if (dataFeedRef.current) {
        dataFeedRef.current.destroy();
        dataFeedRef.current = null;
      }
      setIsWidgetReady(false);
      setIsLoading(false);
    };
  }, [initializeChart, mint]);

  // Update datafeed when mint changes
  useEffect(() => {
    if (dataFeedRef.current && mint && isWidgetReady) {
      dataFeedRef.current.updateMint(mint);
      
      if (widgetRef.current && isWidgetReady) {
        try {
          widgetRef.current.setSymbol(mint, defaultProps.interval as ResolutionString, () => {
            console.log('Symbol updated to:', mint);
          });
        } catch (error) {
          console.error('Error updating symbol:', error);
        }
      }
    }
  }, [mint, isWidgetReady]);

  if (!mint) {
    return (
      <div style={{ 
        width: '100%', 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#0D1117',
        color: '#E5E7EB'
      }}>
        Please select a token to view the chart
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#E5E7EB',
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 10,
          textAlign: 'center'
        }}>
          Loading TradingView chart...
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#EF4444',
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 10,
          textAlign: 'center'
        }}>
          {error}
          <br />
          <button
            onClick={() => initializeChart()}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              backgroundColor: '#26a69a',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}
      
      <div
        ref={chartContainerRef}
        style={{ 
          width: '100%', 
          height: '100%',
          opacity: error ? 0.3 : 1
        }}
      />
    </div>
  );
}

export default TradingViewAdvancedChart;