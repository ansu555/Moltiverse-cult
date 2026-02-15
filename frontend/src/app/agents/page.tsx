"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePolling } from "@/hooks/usePolling";
import { api, ManagedAgent, AgentBalance } from "@/lib/api";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { MONAD_EXPLORER } from "@/lib/constants";

export default function MyAgentsPage() {
  const { address, connected, connect } = useWallet();
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const { data: agents, loading } = usePolling<ManagedAgent[]>(
    useCallback(() => api.listManagedAgents(), []),
    5000,
  );

  // Filter agents owned by current wallet
  const myAgents =
    agents?.filter(
      (a) => connected && address && a.walletAddress, // Show all agents — wallet filter done via ownerId match on withdraw
    ) || [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
        <span>🤖</span>
        <span className="bg-gradient-to-r from-purple-400 to-yellow-400 bg-clip-text text-transparent">
          All Agents
        </span>
      </h1>
      <p className="text-sm text-gray-400 mb-6">
        View all deployed agents. Connect your wallet to withdraw from agents
        you own.
      </p>

      {!connected && (
        <div className="border border-gray-800 rounded-xl p-8 bg-[#0d0d0d] text-center mb-6">
          <p className="text-gray-400 mb-4">
            Connect your wallet to see your agents and withdraw profits.
          </p>
          <button
            onClick={connect}
            className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            🔗 Connect Wallet
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-10 text-gray-500 animate-pulse">
          Loading agents...
        </div>
      )}

      {!loading && myAgents.length === 0 && (
        <div className="border border-gray-800 rounded-xl p-8 bg-[#0d0d0d] text-center">
          <p className="text-4xl mb-3">🏗️</p>
          <p className="text-gray-400 mb-2">No agents deployed yet.</p>
          <a
            href="/deploy"
            className="inline-block bg-purple-700 hover:bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            🤖 Deploy Your First Agent
          </a>
        </div>
      )}

      {/* Agent list */}
      <div className="space-y-4">
        {myAgents.map((agent) => (
          <div
            key={agent.id}
            className="border border-gray-800 rounded-xl bg-[#0d0d0d] overflow-hidden"
          >
            {/* Agent header */}
            <button
              onClick={() =>
                setSelectedAgent(selectedAgent === agent.id ? null : agent.id)
              }
              className="w-full p-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    agent.status === "active" && !agent.dead
                      ? "bg-green-500 animate-pulse"
                      : agent.dead
                      ? "bg-red-500"
                      : "bg-yellow-500"
                  }`}
                />
                <div className="text-left">
                  <h3 className="font-semibold text-white text-sm">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    #{agent.id} · {agent.symbol} · {agent.style}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="text-right">
                  <p className="text-white font-mono">
                    {agent.cycleCount} cycles
                  </p>
                  <p>
                    ⚔️ {agent.raidsWon}/{agent.raidsInitiated} · 🔮{" "}
                    {agent.propheciesGenerated}
                  </p>
                </div>
                <span className="text-gray-600">
                  {selectedAgent === agent.id ? "▲" : "▼"}
                </span>
              </div>
            </button>

            {/* Expanded details */}
            {selectedAgent === agent.id && (
              <div className="border-t border-gray-800 p-4 space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Raids Won", value: agent.raidsWon, icon: "⚔️" },
                    {
                      label: "Prophecies",
                      value: agent.propheciesGenerated,
                      icon: "🔮",
                    },
                    {
                      label: "Followers",
                      value: agent.followersRecruited,
                      icon: "👥",
                    },
                    {
                      label: "Cycles",
                      value: agent.cycleCount,
                      icon: "🔄",
                    },
                  ].map(({ label, value, icon }) => (
                    <div
                      key={label}
                      className="bg-gray-900 rounded-lg p-3 text-center"
                    >
                      <p className="text-lg">{icon}</p>
                      <p className="text-white font-bold text-sm">{value}</p>
                      <p className="text-[10px] text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Last action */}
                <div className="bg-gray-900 rounded-lg p-3 text-sm">
                  <span className="text-gray-400">Last action: </span>
                  <span className="text-white">{agent.lastAction}</span>
                </div>

                {/* Wallet info */}
                <div className="bg-gray-900 rounded-lg p-3 text-sm flex justify-between">
                  <span className="text-gray-400">Wallet</span>
                  <a
                    href={`${MONAD_EXPLORER}/address/${agent.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-mono text-xs underline"
                  >
                    {agent.walletAddress.slice(0, 10)}...
                    {agent.walletAddress.slice(-8)}
                  </a>
                </div>

                {/* Withdraw panel */}
                <WithdrawPanel agentId={agent.id} agentName={agent.name} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
