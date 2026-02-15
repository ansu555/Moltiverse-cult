"use client";

import { useCallback } from "react";
import { api, Cult, Raid } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { RaidArena } from "@/components/RaidArena";

export default function ArenaPage() {
  const { data: raids, loading: loadingRaids } = usePolling<Raid[]>(
    useCallback(() => api.getRaids(30), []),
    4000,
  );
  const { data: cults } = usePolling<Cult[]>(
    useCallback(() => api.getCults(), []),
    10000,
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {loadingRaids ? (
        <div className="text-center py-20 text-gray-500 animate-pulse font-mono">
          The arena is being prepared...
        </div>
      ) : (
        <RaidArena raids={raids || []} cults={cults || []} />
      )}
    </div>
  );
}
