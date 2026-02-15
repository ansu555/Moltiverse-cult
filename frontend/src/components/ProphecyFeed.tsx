"use client";

import { Prophecy } from "@/lib/api";
import { CULT_COLORS, CULT_ICONS } from "@/lib/constants";

interface Props {
  prophecies: Prophecy[];
  maxItems?: number;
}

export function ProphecyFeed({ prophecies, maxItems = 20 }: Props) {
  // PROPHECY_DISABLED_START
  // Rendering of live prophecy items is disabled in runtime UI.
  // Keep component as a re-enable anchor.
  // PROPHECY_DISABLED_END
  const prophecyDisabled = true;
  if (prophecyDisabled) {
    return (
      <div className="text-center text-gray-500 py-8 font-mono">
        Prophecy feed is disabled.
      </div>
    );
  }

  const items = prophecies.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {items.map((p) => {
        const color = CULT_COLORS[p.cultId] || "#666";
        const icon = CULT_ICONS[p.cultId] || "—";
        const timeAgo = getTimeAgo(p.createdAt);

        return (
          <div
            key={p.id}
            className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
            style={{ borderLeftColor: color, borderLeftWidth: 3 }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className="font-semibold text-sm" style={{ color }}>
                  {p.cultName}
                </span>
                {p.resolved && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                      p.correct
                        ? "bg-green-900/40 text-green-400"
                        : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {p.correct ? "✓ FULFILLED" : "✗ FAILED"}
                  </span>
                )}
                {!p.resolved && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 font-mono animate-pulse-slow">
                    AWAITING
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-600">{timeAgo}</span>
            </div>

            <p className="text-gray-200 font-mono text-sm leading-relaxed italic">
              &ldquo;{p.text}&rdquo;
            </p>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>Prediction: {p.prediction}</span>
              <span className="font-mono">
                Confidence: {(p.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="text-center text-gray-500 py-8 font-mono">
          The oracle is silent... awaiting the first prophecy.
        </div>
      )}
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
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
