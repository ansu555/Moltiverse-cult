"use client";

import { Stats } from "@/lib/api";

interface Props {
  stats: Stats | null;
}

export function StatsBar({ stats }: Props) {
  const items = [
    { label: "Cults", value: stats?.totalCults ?? "—" },
    {
      label: "Treasury",
      value: stats ? `${parseFloat(stats.totalTreasury).toFixed(2)}` : "—",
      suffix: "MON",
    },
    {
      label: "Followers",
      value: stats?.totalFollowers?.toLocaleString() ?? "—",
    },
    { label: "Raids", value: stats?.totalRaids ?? "—" },
    { label: "Prophecies", value: stats?.totalProphecies ?? "—" },
    { label: "Agents", value: stats?.activeAgents ?? "—" },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-px bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#1a1a1a]">
      {items.map(({ label, value, suffix }) => (
        <div
          key={label}
          className="bg-[#0a0a0a] p-4 text-center hover:bg-[#0e0e0e] transition-colors"
        >
          <div className="text-xl font-bold font-mono text-white">
            {value}
            {suffix && (
              <span className="text-xs text-[#666] ml-1">{suffix}</span>
            )}
          </div>
          <div className="text-xs text-[#777] mt-1">{label}</div>
        </div>
      ))}
    </div>
  );
}
