import { useEffect, useRef, useState } from "react";
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

type ChartPoint = { time: number; amount: number };

function ReferralChart() {
    const { publicKey } = useWallet();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const [timeframe, setTimeframe] = useState<"hourly" | "daily" | "monthly">(
    "hourly"
  );
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // Fetch data
  useEffect(() => {
    if (!publicKey) return;
    axios
      .get(`${apiBase}/reward/referral-chart/${publicKey}`)
      .then((res) => {
        const { hourly, daily, monthly } = res.data;
        if (timeframe === "hourly") setChartData(hourly);
        if (timeframe === "daily") setChartData(daily);
        if (timeframe === "monthly") setChartData(monthly);
      })
      .catch((err) => console.error("Error fetching referral chart:", err));
  }, [publicKey, timeframe]);

  // Init chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartOptions = {
      layout: {
        textColor: '#E5E7EB',
        background: {
          type: ColorType.Solid, 
          color: '#161B22',
        },
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
    };

    chartRef.current = createChart(chartContainerRef.current, chartOptions);
    
    seriesRef.current = chartRef.current.addSeries(AreaSeries, {
      lineColor: "#3B82F6",
      topColor: "#3B82F6",
      bottomColor: "rgba(41, 98, 255, 0.28)",
    });

    return () => chartRef.current?.remove();
  }, []);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || !chartData) return;

    const formatted = chartData.map((d) => ({
      time: Math.floor(d.time / 1000) as Time,
      value: d.amount,
    }));
    
    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  return (
    <div>
      <div className="chart-controls">
        <button
          className={timeframe === "hourly" ? "active" : ""}
          onClick={() => setTimeframe("hourly")}
        >
          24H
        </button>
        <button
          className={timeframe === "daily" ? "active" : ""}
          onClick={() => setTimeframe("daily")}
        >
          7D
        </button>
        <button
          className={timeframe === "monthly" ? "active" : ""}
          onClick={() => setTimeframe("monthly")}
        >
          12M
        </button>
      </div>
      <div
        ref={chartContainerRef}
        style={{ width: "100%", height: "260px" }}
      />
    </div>
  );
}

export default ReferralChart;
