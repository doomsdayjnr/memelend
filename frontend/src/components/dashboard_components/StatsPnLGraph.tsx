import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  ColorType,
} from "lightweight-charts";
import axios from "axios";

type ChartPoint = { time: number; pnlUsd: number };

function StatsPnLGraph() {
  const { publicKey } = useWallet();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Track selected interval
  const [timeframe, setTimeframe] = useState<"last24h" | "last7d" | "last30d" | "last12mo">("last24h");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // Fetch data from backend
  useEffect(() => {
    if (!publicKey) return;

    axios
      .get(`${apiBase}/user/profit-stats/${publicKey}`)
      .then((res) => {
        const data = res.data;
        switch (timeframe) {
          case "last24h":
            setChartData(data.last24h);
            break;
          case "last7d":
            setChartData(data.last7d);
            break;
          case "last30d":
            setChartData(data.last30d);
            break;
          case "last12mo":
            setChartData(data.last12mo);
            break;
        }
      })
      .catch((err) => console.error("Error fetching profit stats:", err));
  }, [publicKey, timeframe]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        textColor: '#E5E7EB',
        background: { type: ColorType.Solid, color: '#161B22' },
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
    });

    seriesRef.current = chartRef.current.addSeries(AreaSeries, {
      lineColor: "#3B82F6",
      topColor: "rgba(59, 130, 246, 0.28)",
      bottomColor: "rgba(41, 98, 255, 0.28)",
    });

    return () => chartRef.current?.remove();
  }, []);

  // Update chart data
  useEffect(() => {
    if (!seriesRef.current || !chartData) return;

    const formatted = chartData.map((d) => ({
      time: Math.floor(d.time / 1000) as Time,
      value: d.pnlUsd,
    }));

    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  return (
    <div>
      <div className="chart-controls">
        <button
          className={timeframe === "last24h" ? "active" : ""}
          onClick={() => setTimeframe("last24h")}
        >
          24H
        </button>
        <button
          className={timeframe === "last7d" ? "active" : ""}
          onClick={() => setTimeframe("last7d")}
        >
          7D
        </button>
        <button
          className={timeframe === "last30d" ? "active" : ""}
          onClick={() => setTimeframe("last30d")}
        >
          30D
        </button>
        <button
          className={timeframe === "last12mo" ? "active" : ""}
          onClick={() => setTimeframe("last12mo")}
        >
          12M
        </button>
      </div>

      <div
        ref={chartContainerRef}
        style={{ width: "100%", height: "286px" }}
      />
    </div>
  );
}

export default StatsPnLGraph;
