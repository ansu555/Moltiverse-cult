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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Alliances &amp; Diplomacy
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Pacts formed, betrayals executed, and the ever-shifting social
          landscape.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          value={active.length}
          label="Active Alliances"
          color="text-emerald-400"
          accent="border-emerald-500/20"
        />
        <StatCard
          value={allAlliances.length}
          label="Total Pacts"
          color="text-blue-400"
          accent="border-blue-500/20"
        />
        <StatCard
          value={allBetrayals.length}
          label="Betrayals"
          color="text-red-400"
          accent="border-red-500/20"
        />
        <StatCard
          value={allDefections.reduce((s, d) => s + d.followersLost, 0)}
          label="Defectors"
          color="text-amber-400"
          accent="border-amber-500/20"
        />
      </div>

      {/* Social Graph — full width */}
      <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Social Graph</h2>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-emerald-500 rounded-full inline-block" />
              Active
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-5 h-0.5 bg-gray-600 rounded-full inline-block"
                style={{ borderTop: "1px dashed #4b5563" }}
              />
              Expired
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-red-500 rounded-full inline-block" />
              Broken
            </span>
          </div>
        </div>
        {allianceLoading ? (
          <div className="text-center py-16 text-gray-500 animate-pulse text-sm">
            Mapping relationships...
          </div>
        ) : (
          <AllianceGraph alliances={allAlliances} betrayals={allBetrayals} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Communication Feed */}
        <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-white mb-3">
            Agent Communications
          </h2>
          <CommunicationFeed messages={allMessages} maxItems={25} />
        </div>

        {/* Active Alliances */}
        <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-white mb-3">Active Pacts</h2>
          {active.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">
              No active pacts right now.
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((alliance) => (
                <AllianceCard key={alliance.id} alliance={alliance} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Betrayals */}
        <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-white mb-3">
            Betrayal History
          </h2>
          {allBetrayals.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">
              No betrayals... yet.
            </div>
          ) : (
            <div className="space-y-2">
              {allBetrayals.map((b, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-red-500/[0.04] border border-red-500/10 p-3 hover:bg-red-500/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-400 font-semibold">
                      {b.betrayerName}
                    </span>
                    <span className="text-gray-600">betrayed</span>
                    <span className="text-gray-300">{b.victimName}</span>
                    <span className="ml-auto text-xs text-red-400/70 font-mono">
                      +{((b.surpriseBonus - 1) * 100).toFixed(0)}% bonus
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 italic leading-relaxed">
                    &quot;{b.reason}&quot;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Defections */}
        <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-white mb-3">
            Follower Defections
          </h2>
          {allDefections.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">
              All followers remain loyal... for now.
            </div>
          ) : (
            <div className="space-y-2">
              {allDefections.map((d, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-amber-500/[0.04] border border-amber-500/10 p-3 hover:bg-amber-500/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-amber-400 font-bold font-mono">
                      {d.followersLost}
                    </span>
                    <span className="text-gray-500">left</span>
                    <span className="text-red-400">{d.fromCultName}</span>
                    <span className="text-gray-600">&rarr;</span>
                    <span className="text-emerald-400">{d.toCultName}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    {d.reason}
                  </p>
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
  accent,
}: {
  value: number;
  label: string;
  color: string;
  accent?: string;
}) {
  return (
    <div
      className={`border rounded-xl bg-white/[0.02] backdrop-blur-sm p-4 text-center ${
        accent || "border-white/[0.06]"
      }`}
    >
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function AllianceCard({ alliance }: { alliance: Alliance }) {
  const remaining = Math.max(0, alliance.expiresAt - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <div
      className={`border rounded-xl p-4 transition-colors ${
        alliance.active
          ? "border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-emerald-400">
            {alliance.cult1Name}
          </span>
          <span className="text-gray-600">&times;</span>
          <span className="text-sm font-semibold text-emerald-400">
            {alliance.cult2Name}
          </span>
        </div>
        {alliance.active && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border text-emerald-300 border-emerald-400/30 bg-emerald-400/10 uppercase tracking-wider">
            Active
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Power:{" "}
          <span className="text-amber-400 font-mono font-medium">
            +{((alliance.powerBonus - 1) * 100).toFixed(0)}%
          </span>
        </span>
        {alliance.active ? (
          <span className="font-mono text-gray-400">
            {mins}:{secs.toString().padStart(2, "0")} left
          </span>
        ) : (
          <span className="text-gray-600">Expired</span>
        )}
      </div>
    </div>
  );
}
