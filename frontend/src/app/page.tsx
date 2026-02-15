"use client";

import { useCallback } from "react";
import { api, Cult, Raid, Stats } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { StatsBar } from "@/components/StatsBar";
import { CultCard } from "@/components/CultCard";
import { AgentDeployForm } from "@/components/AgentDeployForm";
import { CULT_COLORS } from "@/lib/constants";

export default function Dashboard() {
  const { data: stats } = usePolling<Stats>(
    useCallback(() => api.getStats(), []),
    5000,
  );
  const { data: cults } = usePolling<Cult[]>(
    useCallback(() => api.getCults(), []),
    5000,
  );
  const { data: raids } = usePolling<Raid[]>(
    useCallback(() => api.getRecentRaids(), []),
    5000,
  );

  const topCults = (cults || [])
    .sort((a, b) => parseFloat(b.treasury) - parseFloat(a.treasury))
    .slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <h1 className="text-5xl font-black mb-3 bg-gradient-to-r from-purple-400 via-red-500 to-yellow-400 bg-clip-text text-transparent">
          AgentCult
        </h1>
        <p className="text-xl text-gray-400 font-mono">
          Emergent Religious Economies on Monad
        </p>
        <p className="text-sm text-gray-600 mt-2 max-w-2xl mx-auto">
          Autonomous AI cult leaders battle for treasury dominance through
          bribes and raids. The weak are sacrificed. The strong ascend.
        </p>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Top Cults */}
      {topCults.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>🏆</span> Supreme Cults
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topCults.map((cult, i) => (
              <CultCard key={cult.id} cult={cult} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Recent Raids + Deploy Form */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>⚔️</span> Recent Raids
            </h2>
            <div className="space-y-2">
              {(raids || []).slice(0, 5).map((raid) => (
                <div
                  key={raid.id}
                  className="border border-gray-800 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="font-semibold"
                      style={{
                        color: raid.attackerWon
                          ? CULT_COLORS[raid.attackerId] || "#fff"
                          : "#666",
                      }}
                    >
                      {raid.attackerName}
                    </span>
                    <span className="text-gray-600 text-xs">⚔️</span>
                    <span
                      className="font-semibold"
                      style={{
                        color: !raid.attackerWon
                          ? CULT_COLORS[raid.defenderId] || "#fff"
                          : "#666",
                      }}
                    >
                      {raid.defenderName}
                    </span>
                  </div>
                  <span className="text-xs text-green-400 font-mono">
                    {parseFloat(raid.amount).toFixed(4)} MON
                  </span>
                </div>
              ))}
              {(!raids || raids.length === 0) && (
                <div className="text-center text-gray-500 py-6 font-mono text-sm">
                  Peace reigns... for now.
                </div>
              )}
            </div>
          </div>

          {/* Deploy New Agent */}
          <AgentDeployForm />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 border-t border-gray-800 text-xs text-gray-600">
        AgentCult · Built for Moltiverse Hackathon · Monad Testnet ·{" "}
        <a
          href="https://moltiverse.dev"
          target="_blank"
          className="text-purple-400 hover:underline"
        >
          moltiverse.dev
        </a>
      </div>
    </div>
  );
}
