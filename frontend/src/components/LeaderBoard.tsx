"use client";

import Link from "next/link";
import { Cult } from "@/lib/api";
import { CULT_COLORS, CULT_ICONS } from "@/lib/constants";

interface Props {
  cults: Cult[];
}

export function LeaderBoard({ cults }: Props) {
  const sorted = [...cults].sort(
    (a, b) => parseFloat(b.treasury) - parseFloat(a.treasury),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1a1a1a] text-[#888] text-left">
            <th className="py-3 px-4 font-medium">Rank</th>
            <th className="py-3 px-4 font-medium">Cult</th>
            <th className="py-3 px-4 font-medium text-right">Treasury (MON)</th>
            <th className="py-3 px-4 font-medium text-right">Followers</th>
            <th className="py-3 px-4 font-medium text-right">Raids W/L</th>
            <th className="py-3 px-4 font-medium text-right">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((cult, i) => {
            const color = CULT_COLORS[cult.id] || "#666";
            const icon = CULT_ICONS[cult.id] || "⛪";
            const totalRaids = cult.raidWins + cult.raidLosses;
            const winRate =
              totalRaids > 0
                ? ((cult.raidWins / totalRaids) * 100).toFixed(0)
                : "—";

            return (
              <tr
                key={cult.id}
                className="border-b border-[#1a1a1a]/50 hover:bg-white/[0.03] transition-colors"
              >
                <td className="py-4 px-4">
                  <span
                    className={`text-lg font-bold ${
                      i === 0
                        ? "text-yellow-400"
                        : i === 1
                        ? "text-[#ddd]"
                        : i === 2
                        ? "text-amber-600"
                        : "text-[#666]"
                    }`}
                  >
                    #{i + 1}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <Link
                    href={`/cults/${cult.id}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <div
                        className="font-semibold group-hover:underline"
                        style={{ color }}
                      >
                        {cult.name}
                      </div>
                      <div className="text-xs text-[#666] font-mono truncate max-w-[200px]">
                        {cult.tokenAddress
                          ? `${cult.tokenAddress.slice(
                              0,
                              6,
                            )}...${cult.tokenAddress.slice(-4)}`
                          : "No token"}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="py-4 px-4 text-right font-mono font-bold text-green-400">
                  {parseFloat(cult.treasury).toFixed(4)}
                </td>
                <td className="py-4 px-4 text-right font-mono">
                  {cult.followers.toLocaleString()}
                </td>
                <td className="py-4 px-4 text-right font-mono">
                  <span className="text-green-400">{cult.raidWins}</span>
                  <span className="text-[#555]">/</span>
                  <span className="text-red-400">{cult.raidLosses}</span>
                </td>
                <td className="py-4 px-4 text-right font-mono">{winRate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center text-[#666] py-12">
          No cults registered yet. The prophecy awaits...
        </div>
      )}
    </div>
  );
}
