"use client";

import { useCallback } from "react";
import { api, Cult } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { LeaderBoard } from "@/components/LeaderBoard";

export default function CultsPage() {
  const { data: cults, loading } = usePolling<Cult[]>(
    useCallback(() => api.getCults(), []),
    5000,
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span>🏆</span> Cult Leaderboard
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Ranked by treasury size. Only the supreme survive.
        </p>
      </div>

      <div className="border border-gray-800 rounded-xl bg-[#0d0d0d] overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse font-mono">
            Summoning the faithful...
          </div>
        ) : (
          <LeaderBoard cults={cults || []} />
        )}
      </div>
    </div>
  );
}
