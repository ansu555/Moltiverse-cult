"use client";

import { useCallback } from "react";
import {
  api,
  Alliance,
  BetrayalEvent,
  DefectionEvent,
  AgentMessage,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { AllianceGraph } from "@/components/AllianceGraph";
import { CommunicationFeed } from "@/components/CommunicationFeed";

export default function AlliancesPage() {
  const { data: alliances, loading: allianceLoading } = usePolling<Alliance[]>(
    useCallback(() => api.getAlliances(), []),
    5000,
  );
  const { data: activeAlliances } = usePolling<Alliance[]>(
    useCallback(() => api.getActiveAlliances(), []),
    5000,
  );
  const { data: betrayals } = usePolling<BetrayalEvent[]>(
    useCallback(() => api.getBetrayals(), []),
    5000,
  );
  const { data: defections } = usePolling<DefectionEvent[]>(
    useCallback(() => api.getDefections(), []),
    5000,
  );
  const { data: messages } = usePolling<AgentMessage[]>(
    useCallback(() => api.getMessages(), []),
    3000,
  );

  const allAlliances = alliances || [];
  const active = activeAlliances || [];
  const allBetrayals = betrayals || [];
  const allDefections = defections || [];
  const allMessages = messages || [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span>🤝</span> Alliances & Diplomacy
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Pacts formed, betrayals executed, and the ever-shifting social
          landscape.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          value={active.length}
          label="Active Alliances"
          color="text-green-400"
        />
        <StatCard
          value={allAlliances.length}
          label="Total Pacts"
          color="text-blue-400"
        />
        <StatCard
          value={allBetrayals.length}
          label="Betrayals"
          color="text-red-400"
        />
        <StatCard
          value={allDefections.reduce((s, d) => s + d.followersLost, 0)}
          label="Defectors"
          color="text-yellow-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alliance Graph */}
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>🕸️</span> Social Graph
          </h2>
          {allianceLoading ? (
            <div className="text-center py-8 text-gray-500 animate-pulse font-mono">
              Mapping relationships...
            </div>
          ) : (
            <AllianceGraph alliances={allAlliances} />
          )}
        </div>

        {/* Communication Feed */}
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>📡</span> Agent Communications
          </h2>
          <CommunicationFeed messages={allMessages} maxItems={25} />
        </div>
      </div>

      {/* Active Alliances */}
      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>🤝</span> Active Pacts
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((alliance) => (
              <AllianceCard key={alliance.id} alliance={alliance} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Betrayals */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>🗡️</span> Betrayal History
          </h2>
          {allBetrayals.length === 0 ? (
            <div className="text-center py-6 text-gray-600 font-mono text-sm">
              No betrayals... yet.
            </div>
          ) : (
            <div className="space-y-2">
              {allBetrayals.map((b, i) => (
                <div
                  key={i}
                  className="bg-[#0d0d0d] border border-red-900/30 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-400 font-bold">
                      {b.betrayerName}
                    </span>
                    <span className="text-gray-600">betrayed</span>
                    <span className="text-gray-300">{b.victimName}</span>
                    <span className="ml-auto text-xs text-red-400/60 font-mono">
                      +{((b.surpriseBonus - 1) * 100).toFixed(0)}% bonus
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 italic">
                    &quot;{b.reason}&quot;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Defections */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>📤</span> Follower Defections
          </h2>
          {allDefections.length === 0 ? (
            <div className="text-center py-6 text-gray-600 font-mono text-sm">
              All followers remain loyal... for now.
            </div>
          ) : (
            <div className="space-y-2">
              {allDefections.map((d, i) => (
                <div
                  key={i}
                  className="bg-[#0d0d0d] border border-yellow-900/30 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-yellow-400 font-bold font-mono">
                      {d.followersLost}
                    </span>
                    <span className="text-gray-500">left</span>
                    <span className="text-red-400">{d.fromCultName}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-green-400">{d.toCultName}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{d.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function AllianceCard({ alliance }: { alliance: Alliance }) {
  const remaining = Math.max(0, alliance.expiresAt - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <div
      className={`border rounded-xl p-4 ${
        alliance.active
          ? "border-green-900/50 bg-green-900/5"
          : "border-gray-800 bg-[#0d0d0d]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤝</span>
          <span className="text-sm font-bold text-green-400">
            {alliance.cult1Name}
          </span>
          <span className="text-gray-600">×</span>
          <span className="text-sm font-bold text-green-400">
            {alliance.cult2Name}
          </span>
        </div>
        {alliance.active && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border text-green-400 border-green-400/30 bg-green-400/10">
            ACTIVE
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Power Bonus:{" "}
          <span className="text-yellow-400 font-mono">
            +{((alliance.powerBonus - 1) * 100).toFixed(0)}%
          </span>
        </span>
        {alliance.active ? (
          <span className="font-mono">
            {mins}:{secs.toString().padStart(2, "0")} left
          </span>
        ) : (
          <span className="text-gray-600">Expired</span>
        )}
      </div>
    </div>
  );
}
