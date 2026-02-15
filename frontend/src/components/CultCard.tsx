"use client";

import Link from "next/link";
import { Cult } from "@/lib/api";
import { CULT_COLORS, CULT_ICONS } from "@/lib/constants";

interface Props {
  cult: Cult;
  rank?: number;
}

export function CultCard({ cult, rank }: Props) {
  const color = CULT_COLORS[cult.id] || "#666";
  const icon = CULT_ICONS[cult.id] || "—";
  const totalRaids = cult.raidWins + cult.raidLosses;
  const winRate =
    totalRaids > 0 ? ((cult.raidWins / totalRaids) * 100).toFixed(0) : "—";

  return (
    <Link href={`/cults/${cult.id}`}>
      <div
        className="relative cult-card p-5 hover:scale-[1.01] transition-all cursor-pointer group"
        style={{
          background: `linear-gradient(160deg, ${color}08 0%, #0e0e0e 40%, #0a0a0a 100%)`,
        }}
      >
        {rank !== undefined && (
          <div
            className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border"
            style={{
              background: `${color}15`,
              borderColor: `${color}30`,
              color: color,
            }}
          >
            #{rank}
          </div>
        )}

        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center border"
            style={{
              background: `${color}10`,
              borderColor: `${color}20`,
            }}
          >
            <span className="text-xl">{icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-white group-hover:text-opacity-90">
              {cult.name}
            </h3>
            <p className="text-xs text-[#666] font-mono">
              {cult.tokenAddress
                ? `${cult.tokenAddress.slice(0, 8)}...${cult.tokenAddress.slice(
                    -6,
                  )}`
                : "No token linked"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <div className="text-[11px] text-[#666] mb-1">Treasury</div>
            <div className="font-bold font-mono text-sm text-green-400">
              {parseFloat(cult.treasury).toFixed(2)}
            </div>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <div className="text-[11px] text-[#666] mb-1">Followers</div>
            <div className="font-bold font-mono text-sm text-white">
              {cult.followers}
            </div>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2.5">
            <div className="text-[11px] text-[#666] mb-1">Win Rate</div>
            <div className="font-bold font-mono text-sm" style={{ color }}>
              {winRate}%
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-between text-xs text-[#666]">
          <span>
            <span className="text-green-400">{cult.raidWins}W</span>
            <span className="text-[#444] mx-1">/</span>
            <span className="text-red-400">{cult.raidLosses}L</span>
          </span>
          <span>Since {new Date(cult.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
