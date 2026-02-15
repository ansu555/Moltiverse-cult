"use client";

import { useState, useEffect } from "react";
import { Raid, Cult } from "@/lib/api";
import { CULT_COLORS, CULT_ICONS } from "@/lib/constants";

interface Props {
  raids: Raid[];
  cults: Cult[];
}

export function RaidArena({ raids, cults }: Props) {
  const [activeRaid, setActiveRaid] = useState<Raid | null>(null);
  const [animating, setAnimating] = useState(false);

  // Auto-cycle through recent raids for demo effect
  useEffect(() => {
    if (raids.length === 0) return;
    let lastId: string | null = null;
    const cycle = setInterval(() => {
      setAnimating(true);
      const pool = raids.slice(0, Math.min(raids.length, 10));
      const candidates = pool.filter((raid) => raid.id !== lastId);
      const next =
        candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
      setActiveRaid(next);
      setTimeout(() => setAnimating(false), 2000);
      lastId = next.id;
    }, 5000);
    // Show first raid immediately
    setActiveRaid(raids[0]);
    return () => clearInterval(cycle);
  }, [raids]);

  const getCult = (id: number) => cults.find((c) => c.id === id);

  return (
    <div className="space-y-6">
      {/* Arena Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Raid Arena</h2>
        <p className="text-gray-500 text-sm">
          Cults wage war for treasury dominance. The weak are sacrificed.
        </p>
      </div>

      {/* Active Battle Visualization */}
      {activeRaid ? (
        <div
          className={`relative rounded-2xl border-2 p-8 transition-all duration-500 ${
            animating ? "border-red-500/80 glow-red" : "border-gray-800"
          }`}
          style={{
            background: "linear-gradient(180deg, #1a0000 0%, #0a0a0a 100%)",
          }}
        >
          {/* Battle Label */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-900/80 rounded-full text-xs font-mono text-red-300 border border-red-700">
            {animating ? "BATTLE IN PROGRESS" : "LAST RAID RESULT"}
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            {/* Attacker */}
            <div className="text-center">
              <div
                className={`text-5xl mb-3 transition-transform duration-500 ${
                  animating ? "animate-float scale-110" : ""
                }`}
              >
                {CULT_ICONS[activeRaid.attackerId] || "—"}
              </div>
              <div
                className="font-bold text-lg"
                style={{ color: CULT_COLORS[activeRaid.attackerId] || "#fff" }}
              >
                {activeRaid.attackerName}
              </div>
              <div className="text-xs text-gray-500 mt-1">ATTACKER</div>
              {activeRaid.attackerWon && (
                <div className="mt-2 text-yellow-400 text-xs font-bold animate-pulse">
                  VICTOR
                </div>
              )}
            </div>

            {/* VS / Amount */}
            <div className="text-center">
              <div
                className={`text-4xl font-black mb-2 transition-all duration-300 ${
                  animating ? "text-red-500 scale-125" : "text-gray-600"
                }`}
              >
                VS
              </div>
              <div className="bg-gray-900/80 rounded-lg px-4 py-2 inline-block">
                <div className="text-xs text-gray-500">WAGER</div>
                <div className="text-xl font-mono font-bold text-green-400">
                  {parseFloat(activeRaid.amount).toFixed(4)} MON
                </div>
              </div>
              {animating && (
                <div className="mt-3 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-red-500"
                      style={{
                        animation: `pulse-slow 1s ease-in-out ${
                          i * 0.2
                        }s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Defender */}
            <div className="text-center">
              <div
                className={`text-5xl mb-3 transition-transform duration-500 ${
                  animating ? "animate-float scale-110" : ""
                }`}
                style={{ animationDelay: "0.5s" }}
              >
                {CULT_ICONS[activeRaid.defenderId] || "—"}
              </div>
              <div
                className="font-bold text-lg"
                style={{ color: CULT_COLORS[activeRaid.defenderId] || "#fff" }}
              >
                {activeRaid.defenderName}
              </div>
              <div className="text-xs text-gray-500 mt-1">DEFENDER</div>
              {!activeRaid.attackerWon && (
                <div className="mt-2 text-yellow-400 text-xs font-bold animate-pulse">
                  VICTOR
                </div>
              )}
            </div>
          </div>

          {/* Scripture */}
          {activeRaid.scripture && (
            <div className="mt-6 text-center">
              <p className="text-gray-400 font-mono text-xs italic max-w-xl mx-auto">
                &ldquo;{activeRaid.scripture}&rdquo;
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 p-12 text-center bg-[#0d0d0d]">
          <div className="text-xl text-gray-600 mb-4 animate-pulse-slow font-bold">
            —
          </div>
          <p className="text-gray-500 font-mono">
            No raids yet. The cults are gathering strength...
          </p>
        </div>
      )}

      {/* Raid History */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-300">
          Raid History
        </h3>
        <div className="space-y-2">
          {raids.slice(0, 15).map((raid) => (
            <div
              key={raid.id}
              className="flex items-center justify-between border border-gray-800/50 rounded-lg px-4 py-3 hover:bg-gray-800/20 transition-colors cursor-pointer"
              onClick={() => {
                setAnimating(true);
                setActiveRaid(raid);
                setTimeout(() => setAnimating(false), 2000);
              }}
            >
              <div className="flex items-center gap-3">
                <span>{CULT_ICONS[raid.attackerId] || "—"}</span>
                <span
                  className="font-semibold text-sm"
                  style={{
                    color: raid.attackerWon
                      ? CULT_COLORS[raid.attackerId]
                      : "#666",
                  }}
                >
                  {raid.attackerName}
                </span>
                <span className="text-gray-600 text-xs">vs</span>
                <span
                  className="font-semibold text-sm"
                  style={{
                    color: !raid.attackerWon
                      ? CULT_COLORS[raid.defenderId]
                      : "#666",
                  }}
                >
                  {raid.defenderName}
                </span>
                <span>{CULT_ICONS[raid.defenderId] || "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono text-green-400">
                  {parseFloat(raid.amount).toFixed(4)} MON
                </span>
                <span className="text-gray-600">
                  {getTimeAgo(raid.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
