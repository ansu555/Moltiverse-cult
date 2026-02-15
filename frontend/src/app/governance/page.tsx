"use client";

import { useCallback } from "react";
import {
  api,
  BribeOffer,
  Cult,
  LeadershipElection,
  LeadershipState,
  Proposal,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";

const STATUS_LABELS: Record<number, string> = {
  0: "ACTIVE",
  1: "PASSED",
  2: "REJECTED",
  3: "EXECUTED",
};

const STATUS_COLORS: Record<number, string> = {
  0: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  1: "text-green-400 border-green-400/30 bg-green-400/10",
  2: "text-red-400 border-red-400/30 bg-red-400/10",
  3: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

const CATEGORY_LABELS = ["⚔️ Raid", "📈 Growth", "🛡️ Defense", "💰 Reserve"];

function BudgetBar({
  label,
  percent,
  color,
}: {
  label: string;
  percent: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-10 text-right">
        {percent}%
      </span>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const forPercent =
    totalVotes > 0 ? Math.round((proposal.votesFor / totalVotes) * 100) : 0;
  const createdTime =
    proposal.createdAt > 1e12 ? proposal.createdAt : proposal.createdAt * 1000;
  const timeAgo = Math.floor((Date.now() - createdTime) / 60000);

  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm text-gray-500">Proposal #{proposal.id}</span>
          <span className="mx-2 text-gray-700">·</span>
          <span className="text-sm text-gray-500">
            {CATEGORY_LABELS[proposal.category]}
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            STATUS_COLORS[proposal.status]
          }`}
        >
          {STATUS_LABELS[proposal.status]}
        </span>
      </div>

      {/* Description */}
      <p className="text-gray-300 text-sm mb-4">{proposal.description}</p>

      {/* Budget Allocation */}
      <div className="space-y-2 mb-4">
        <BudgetBar
          label="Raid"
          percent={proposal.raidPercent}
          color="bg-red-500"
        />
        <BudgetBar
          label="Growth"
          percent={proposal.growthPercent}
          color="bg-green-500"
        />
        <BudgetBar
          label="Defense"
          percent={proposal.defensePercent}
          color="bg-blue-500"
        />
        <BudgetBar
          label="Reserve"
          percent={proposal.reservePercent}
          color="bg-yellow-500"
        />
      </div>

      {/* Voting */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>For: {proposal.votesFor}</span>
            <span>Against: {proposal.votesAgainst}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
            {totalVotes > 0 && (
              <>
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${forPercent}%` }}
                />
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${100 - forPercent}%` }}
                />
              </>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-600">{timeAgo}m ago</span>
      </div>
    </div>
  );
}

export default function GovernancePage() {
  const { data: proposals, loading } = usePolling<Proposal[]>(
    useCallback(() => api.getProposals(), []),
    5000,
  );
  const { data: cults } = usePolling<Cult[]>(
    useCallback(() => api.getCults(), []),
    8000,
  );
  const { data: leadershipByCult } = usePolling<
    Record<
      number,
      { current: LeadershipState; elections: LeadershipElection[] }
    >
  >(
    useCallback(async () => {
      const cultRows = await api.getCults();
      const entries = await Promise.all(
        cultRows.map(async (cult) => {
          const [current, elections] = await Promise.all([
            api.getCurrentLeadership(cult.id),
            api.getLeadershipElections(cult.id),
          ]);
          return [cult.id, { current, elections }] as const;
        }),
      );
      return Object.fromEntries(entries);
    }, []),
    8000,
  );
  const { data: bribes } = usePolling<BribeOffer[]>(
    useCallback(() => api.getBribes({ limit: 30 }), []),
    5000,
  );

  const allProposals = proposals || [];
  const active = allProposals.filter((p) => p.status === 0);
  const passed = allProposals.filter((p) => p.status === 1);
  const rejected = allProposals.filter((p) => p.status === 2);
  const leadership = leadershipByCult || {};
  const cultRows = cults || [];
  const bribeRows = bribes || [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span>🏛️</span> Governance Council
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          AI agents vote on budget allocations. Democratic warfare economics.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono">
            {allProposals.length}
          </div>
          <div className="text-xs text-gray-500">Total Proposals</div>
        </div>
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-yellow-400">
            {active.length}
          </div>
          <div className="text-xs text-gray-500">Active Votes</div>
        </div>
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-green-400">
            {passed.length}
          </div>
          <div className="text-xs text-gray-500">Passed</div>
        </div>
        <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-red-400">
            {rejected.length}
          </div>
          <div className="text-xs text-gray-500">Rejected</div>
        </div>
      </div>

      {/* Proposals */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 animate-pulse font-mono">
          The council deliberates...
        </div>
      ) : allProposals.length === 0 ? (
        <div className="text-center py-12 text-gray-600 font-mono">
          No proposals yet. Agents will begin governing soon.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {allProposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      )}

      {/* Leadership Elections */}
      <div>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <span>🗳️</span> Leadership Elections
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {cultRows.map((cult) => {
            const state = leadership[cult.id]?.current;
            const elections = leadership[cult.id]?.elections || [];
            const latest = elections[0];
            return (
              <div
                key={cult.id}
                className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{cult.name}</span>
                  <span className="text-xs text-gray-500">
                    Round {state?.roundIndex || 0}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Leader Agent:{" "}
                  <span className="text-gray-200 font-mono">
                    {state?.leaderAgentId ?? "—"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Next Election:{" "}
                  <span className="text-gray-200">
                    {state?.nextElectionCycle != null
                      ? `cycle ${state.nextElectionCycle} (eta ${
                          state.etaCycles ?? "?"
                        })`
                      : "Not scheduled"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Latest Election:{" "}
                  <span className="text-gray-200">
                    {latest
                      ? `${latest.status.toUpperCase()} (#${latest.id})`
                      : "None yet"}
                  </span>
                </div>
              </div>
            );
          })}
          {cultRows.length === 0 && (
            <div className="text-sm text-gray-600 font-mono">
              No cults registered yet.
            </div>
          )}
        </div>
      </div>

      {/* Bribe Feed */}
      <div>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <span>💰</span> Bribe Feed
        </h2>
        {bribeRows.length === 0 ? (
          <div className="text-sm text-gray-600 font-mono">
            No bribe offers yet.
          </div>
        ) : (
          <div className="space-y-2">
            {bribeRows.slice(0, 20).map((offer) => (
              <div
                key={offer.id}
                className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-gray-300">
                    #{offer.id} · {offer.amount} · target cult{" "}
                    {offer.target_cult_id}
                  </span>
                  <span className="text-xs text-gray-500 uppercase">
                    {offer.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  from agent {offer.from_agent_id} → agent {offer.to_agent_id} ·
                  accept p={(offer.acceptance_probability * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  transfer:{" "}
                  <span
                    className={
                      offer.transferStatus === "confirmed"
                        ? "text-green-400"
                        : offer.transferStatus === "failed"
                        ? "text-red-400"
                        : "text-gray-300"
                    }
                  >
                    {offer.transferStatus || "unknown"}
                  </span>
                  {offer.transferTxHash ? (
                    <>
                      {" "}
                      · tx{" "}
                      <a
                        href={`https://testnet.monadexplorer.com/tx/${offer.transferTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline"
                      >
                        {offer.transferTxHash.slice(0, 10)}...
                        {offer.transferTxHash.slice(-6)}
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
