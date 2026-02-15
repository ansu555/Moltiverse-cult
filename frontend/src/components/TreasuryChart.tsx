"use client";

import { useState, useEffect, useRef } from "react";

interface TreasurySnapshot {
  timestamp: number;
  treasury: number;
  followers: number;
  power: number;
}

interface TreasuryChartProps {
  cultName: string;
  cultColor: string;
  treasury: string;
  raidWins: number;
  raidLosses: number;
  followers: number;
}

const MAX_SNAPSHOTS = 60; // ~5 minutes at 5s polling
const CHART_WIDTH = 300;
const CHART_HEIGHT = 60;

function MiniLineChart({
  data,
  color,
  width,
  height,
}: {
  data: number[];
  color: string;
  width: number;
  height: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const polyline = points.join(" ");

  // Create filled area below the line
  const areaPoints = `0,${height} ${polyline} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Gradient fill */}
      <defs>
        <linearGradient
          id={`grad-${color.replace("#", "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={
            height - ((data[data.length - 1] - min) / range) * (height - 4) - 2
          }
          r="2.5"
          fill={color}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}

export function TreasuryChart({
  cultName,
  cultColor,
  treasury,
  raidWins,
  raidLosses,
  followers,
}: TreasuryChartProps) {
  const treasuryValue = parseFloat(treasury);
  const totalRaids = raidWins + raidLosses;
  const winRate = totalRaids > 0 ? (raidWins / totalRaids) * 100 : 0;

  // Power score calculation (matching backend formula)
  const power = treasuryValue * 0.6 + followers * 100 * 0.4;

  // Time-series snapshot history
  const [history, setHistory] = useState<TreasurySnapshot[]>([]);
  const [chartMode, setChartMode] = useState<
    "treasury" | "followers" | "power"
  >("treasury");
  const prevTreasury = useRef(treasuryValue);

  // Accumulate snapshots on each poll update
  useEffect(() => {
    setHistory((prev) => {
      const now = Date.now();
      // Only add if value changed or enough time passed (>4s)
      const last = prev[prev.length - 1];
      if (
        last &&
        now - last.timestamp < 4000 &&
        last.treasury === treasuryValue
      ) {
        return prev;
      }
      const next = [
        ...prev,
        { timestamp: now, treasury: treasuryValue, followers, power },
      ];
      return next.slice(-MAX_SNAPSHOTS);
    });
    prevTreasury.current = treasuryValue;
  }, [treasuryValue, followers, power]);

  // Compute trend indicators
  const treasuryTrend =
    history.length >= 2
      ? history[history.length - 1].treasury -
        history[Math.max(0, history.length - 6)].treasury
      : 0;
  const followerTrend =
    history.length >= 2
      ? history[history.length - 1].followers -
        history[Math.max(0, history.length - 6)].followers
      : 0;

  // Extract data for active chart mode
  const chartData = history.map((s) =>
    chartMode === "treasury"
      ? s.treasury
      : chartMode === "followers"
      ? s.followers
      : s.power,
  );

  // Visual bar heights (normalized to max 100%)
  const maxMetric = Math.max(treasuryValue, followers, raidWins, 1);
  const bars = [
    {
      label: "Treasury",
      value: treasuryValue.toFixed(2),
      unit: "MON",
      height: Math.min(100, (treasuryValue / maxMetric) * 100),
      color: "#22c55e",
    },
    {
      label: "Followers",
      value: followers.toString(),
      unit: "",
      height: Math.min(100, (followers / Math.max(1, maxMetric)) * 100),
      color: "#a855f7",
    },
    {
      label: "Raid Wins",
      value: raidWins.toString(),
      unit: "",
      height: Math.min(100, (raidWins / Math.max(1, maxMetric)) * 100),
      color: "#ef4444",
    },
    {
      label: "Power",
      value: power.toFixed(0),
      unit: "",
      height: Math.min(100, (power / Math.max(1, maxMetric * 100)) * 100),
      color: cultColor,
    },
  ];

  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        Treasury Analytics
        {history.length > 1 && (
          <span className="ml-auto text-[10px] text-gray-600 font-normal">
            {history.length} snapshots
          </span>
        )}
      </h3>

      {/* Time-series Line Chart */}
      {history.length >= 2 && (
        <div className="mb-4 p-3 bg-gray-900/30 rounded-lg">
          {/* Mode selector */}
          <div className="flex gap-2 mb-2">
            {(["treasury", "followers", "power"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setChartMode(mode)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  chartMode === mode
                    ? "bg-gray-700 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {mode === "treasury"
                  ? "Treasury"
                  : mode === "followers"
                  ? "Followers"
                  : "Power"}
              </button>
            ))}
          </div>
          <MiniLineChart
            data={chartData}
            color={
              chartMode === "treasury"
                ? "#22c55e"
                : chartMode === "followers"
                ? "#a855f7"
                : cultColor
            }
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
          />
          {/* Trend indicators */}
          <div className="flex gap-4 mt-2">
            <div className="text-[10px]">
              <span className="text-gray-500">Treasury </span>
              <span
                className={
                  treasuryTrend >= 0 ? "text-green-400" : "text-red-400"
                }
              >
                {treasuryTrend >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(treasuryTrend).toFixed(2)} MON
              </span>
            </div>
            <div className="text-[10px]">
              <span className="text-gray-500">Followers </span>
              <span
                className={
                  followerTrend >= 0 ? "text-green-400" : "text-red-400"
                }
              >
                {followerTrend >= 0 ? "▲" : "▼"} {Math.abs(followerTrend)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Mini bar chart */}
      <div className="flex items-end justify-between gap-3 h-32 mb-4 px-2">
        {bars.map((bar) => (
          <div
            key={bar.label}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div className="text-xs font-mono text-gray-400">
              {bar.value}
              {bar.unit && (
                <span className="text-gray-600 ml-0.5">{bar.unit}</span>
              )}
            </div>
            <div
              className="w-full flex items-end justify-center"
              style={{ height: "80px" }}
            >
              <div
                className="w-8 rounded-t-md transition-all duration-700 ease-out"
                style={{
                  height: `${Math.max(4, bar.height)}%`,
                  backgroundColor: bar.color,
                  opacity: 0.8,
                  boxShadow: `0 0 10px ${bar.color}40`,
                }}
              />
            </div>
            <div className="text-[10px] text-gray-500 text-center">
              {bar.label}
            </div>
          </div>
        ))}
      </div>

      {/* Win Rate Ring */}
      <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
        <div className="relative w-14 h-14">
          <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.91"
              fill="none"
              stroke="#1f2937"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15.91"
              fill="none"
              stroke={cultColor}
              strokeWidth="3"
              strokeDasharray={`${winRate} ${100 - winRate}`}
              strokeDashoffset="0"
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold font-mono">
              {winRate.toFixed(0)}%
            </span>
          </div>
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: cultColor }}>
            {cultName}
          </div>
          <div className="text-xs text-gray-500">
            {raidWins}W / {raidLosses}L · Win Rate
          </div>
        </div>
      </div>
    </div>
  );
}
