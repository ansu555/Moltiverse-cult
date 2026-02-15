"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { api, Cult, Raid } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { StakingPanel } from "@/components/StakingPanel";
import { TreasuryChart } from "@/components/TreasuryChart";
import { CULT_COLORS, CULT_ICONS } from "@/lib/constants";

interface CultDetail extends Cult {
  raids: Raid[];
}

export default function CultDetailPage() {
  const params = useParams();
  const cultId = parseInt(params.id as string);

  const { data: cult, loading } = usePolling<CultDetail>(
    useCallback(() => api.getCult(cultId), [cultId]),
    5000,
  );

  if (loading || !cult) {
    return (
      <div className="text-center py-20 text-gray-500 animate-pulse font-mono">
        Communing with the divine...
      </div>
    );
  }

  const color = CULT_COLORS[cult.id] || "#666";
  const icon = CULT_ICONS[cult.id] || "⛪";
  const totalRaids = cult.raidWins + cult.raidLosses;
  const winRate =
    totalRaids > 0 ? ((cult.raidWins / totalRaids) * 100).toFixed(0) : "—";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div
        className="rounded-xl p-8 border border-gray-800"
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, #0d0d0d 70%)`,
          boxShadow: `0 0 40px ${color}10`,
        }}
      >
        <div className="flex items-center gap-4 mb-6">
          <span className="text-5xl">{icon}</span>
          <div>
            <h1 className="text-3xl font-black" style={{ color }}>
              {cult.name}
            </h1>
            <p className="text-sm text-gray-500 font-mono mt-1">
              Cult #{cult.id} · Founded{" "}
              {new Date(cult.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBlock
            label="Treasury"
            value={`${parseFloat(cult.treasury).toFixed(4)} MON`}
            color="text-green-400"
          />
          <StatBlock
            label="Followers"
            value={cult.followers.toLocaleString()}
          />
          <StatBlock
            label="Raid Record"
            value={`${cult.raidWins}W / ${cult.raidLosses}L`}
          />
          <StatBlock label="Win Rate" value={`${winRate}%`} />
        </div>

        {cult.tokenAddress && (
          <div className="mt-4 text-xs text-gray-500 font-mono">
            Token:{" "}
            <a
              href={`https://testnet.monadexplorer.com/address/${cult.tokenAddress}`}
              target="_blank"
              className="text-purple-400 hover:underline"
            >
              {cult.tokenAddress}
            </a>
          </div>
        )}
      </div>

      {/* Staking + Treasury Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StakingPanel
          cultId={cult.id}
          cultName={cult.name}
          cultColor={color}
          tokenAddress={cult.tokenAddress || ""}
          currentFollowers={cult.followers}
        />
        <TreasuryChart
          cultName={cult.name}
          cultColor={color}
          treasury={cult.treasury}
          raidWins={cult.raidWins}
          raidLosses={cult.raidLosses}
          followers={cult.followers}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PROPHECY_DISABLED_START */}
        {/* <div>
          <h2 className="text-xl font-bold mb-4">🔮 Prophecies</h2>
          <ProphecyFeed prophecies={cult.prophecies || []} maxItems={10} />
        </div> */}
        {/* PROPHECY_DISABLED_END */}

        {/* Raid History */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold mb-4">⚔️ Raid History</h2>
          <div className="space-y-2">
            {(cult.raids || []).map((raid) => {
              const isAttacker = raid.attackerId === cult.id;
              const won = isAttacker ? raid.attackerWon : !raid.attackerWon;
              const opponent = isAttacker
                ? raid.defenderName
                : raid.attackerName;

              return (
                <div
                  key={raid.id}
                  className={`border rounded-lg p-3 flex items-center justify-between ${
                    won ? "border-green-900/50" : "border-red-900/50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className={won ? "text-green-400" : "text-red-400"}>
                      {won ? "✓ WON" : "✗ LOST"}
                    </span>
                    <span className="text-gray-400">
                      {isAttacker ? "attacked" : "defended vs"}{" "}
                      <span className="text-white">{opponent}</span>
                    </span>
                  </div>
                  <span className="text-xs font-mono text-green-400">
                    {parseFloat(raid.amount).toFixed(4)} MON
                  </span>
                </div>
              );
            })}
            {(!cult.raids || cult.raids.length === 0) && (
              <div className="text-center text-gray-500 py-6 font-mono text-sm">
                This cult has not yet entered the arena.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-4 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
