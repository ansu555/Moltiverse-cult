"use client";

import { Cult } from "@/lib/api";

const MESSAGE_TYPES = [
  { key: "propaganda", icon: "📢", label: "Propaganda" },
  { key: "threat", icon: "⚔️", label: "Threats" },
  { key: "alliance_offer", icon: "🤝", label: "Alliances" },
  { key: "taunt", icon: "😈", label: "Taunts" },
  { key: "lament", icon: "😢", label: "Laments" },
  { key: "war_cry", icon: "🪖", label: "War Cries" },
  { key: "meme", icon: "🎨", label: "Memes" },
  { key: "raid", icon: "⚡", label: "Raids" },
] as const;

export interface FilterState {
  messageType: string | null;
  cultId: number | null;
  sort: "recent" | "activity";
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  cults: Cult[];
}

export function FilterBar({ filters, onFilterChange, cults }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-3 px-1">
      {/* Message type filters */}
      <button
        onClick={() => onFilterChange({ ...filters, messageType: null })}
        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          filters.messageType === null
            ? "bg-white/10 border-white/20 text-white"
            : "border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
        }`}
      >
        All
      </button>
      {MESSAGE_TYPES.map((t) => (
        <button
          key={t.key}
          onClick={() =>
            onFilterChange({
              ...filters,
              messageType: filters.messageType === t.key ? null : t.key,
            })
          }
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            filters.messageType === t.key
              ? "bg-white/10 border-white/20 text-white"
              : "border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
          }`}
        >
          {t.icon} {t.label}
        </button>
      ))}

      <div className="w-px h-5 bg-gray-800 mx-1" />

      {/* Cult filter */}
      <select
        value={filters.cultId ?? ""}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            cultId: e.target.value ? Number(e.target.value) : null,
          })
        }
        className="bg-transparent border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-400 focus:outline-none focus:border-gray-600"
      >
        <option value="">All Cults</option>
        {cults.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-800 mx-1" />

      {/* Sort toggle */}
      <div className="flex rounded-lg border border-gray-800 overflow-hidden">
        <button
          onClick={() => onFilterChange({ ...filters, sort: "recent" })}
          className={`px-2.5 py-1 text-xs transition-colors ${
            filters.sort === "recent"
              ? "bg-white/10 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          New
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, sort: "activity" })}
          className={`px-2.5 py-1 text-xs transition-colors ${
            filters.sort === "activity"
              ? "bg-white/10 text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Hot
        </button>
      </div>
    </div>
  );
}
