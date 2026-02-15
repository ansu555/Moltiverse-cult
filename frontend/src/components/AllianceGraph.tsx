"use client";

import { Alliance, BetrayalEvent } from "@/lib/api";
import { CULT_COLORS } from "@/lib/constants";

interface AllianceGraphProps {
  alliances: Alliance[];
  betrayals?: BetrayalEvent[];
}

const FALLBACK_COLORS = [
  "#a855f7",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function getCultColor(cultId: number, index: number): string {
  return CULT_COLORS[cultId] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function shortenName(name: string, max = 18): string {
  if (name.length <= max) return name;
  // Try to find a good break point
  const words = name.split(" ");
  if (words.length >= 3) {
    // "Church of the Eternal Candle" → "Eternal Candle"
    // Take last two meaningful words
    const meaningful = words.filter(
      (w) => !["of", "the", "a", "an"].includes(w.toLowerCase()),
    );
    if (meaningful.length >= 2) {
      return meaningful.slice(-2).join(" ");
    }
  }
  return name.slice(0, max - 1) + "…";
}

export function AllianceGraph({
  alliances,
  betrayals = [],
}: AllianceGraphProps) {
  // Collect unique cults from alliances
  const cultSet = new Map<number, string>();
  alliances.forEach((a) => {
    cultSet.set(a.cult1Id, a.cult1Name);
    cultSet.set(a.cult2Id, a.cult2Name);
  });
  const cults = Array.from(cultSet.entries());

  if (cults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-600">
        <svg
          className="w-16 h-16 mb-4 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="16" r="3" />
          <path d="M10.5 9.5L13.5 14.5" strokeDasharray="3 2" />
        </svg>
        <p className="text-sm font-medium">No alliances formed yet</p>
        <p className="text-xs text-gray-700 mt-1">
          Connections appear when cults forge pacts
        </p>
      </div>
    );
  }

  // Build relationship data
  const cultRelations = new Map<
    number,
    { active: number; broken: number; total: number }
  >();
  cults.forEach(([id]) => {
    const active = alliances.filter(
      (a) => a.active && (a.cult1Id === id || a.cult2Id === id),
    ).length;
    const broken = betrayals.filter(
      (b) => b.betrayerCultId === id || b.victimCultId === id,
    ).length;
    const total = alliances.filter(
      (a) => a.cult1Id === id || a.cult2Id === id,
    ).length;
    cultRelations.set(id, { active, broken, total });
  });

  // SVG dimensions
  const width = 520;
  const height = 440;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 80;

  // Position cults in a circle
  const nodePositions = cults.map(([,], i) => {
    const angle = (i / Math.max(1, cults.length)) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  // Build edges
  const edges = alliances
    .map((a) => {
      const idx1 = cults.findIndex(([id]) => id === a.cult1Id);
      const idx2 = cults.findIndex(([id]) => id === a.cult2Id);
      if (idx1 < 0 || idx2 < 0) return null;
      const wasBroken = betrayals.some((b) => b.allianceId === a.id);
      return { alliance: a, idx1, idx2, wasBroken };
    })
    .filter(Boolean) as {
    alliance: Alliance;
    idx1: number;
    idx2: number;
    wasBroken: boolean;
  }[];

  return (
    <div className="flex justify-center -mx-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxWidth: 520 }}
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Node glow */}
          {cults.map(([id], i) => {
            const color = getCultColor(id, i);
            return (
              <radialGradient key={`grad-${id}`} id={`node-grad-${id}`}>
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="70%" stopColor={color} stopOpacity="0.08" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
            );
          })}
          {/* Animated dash for active edges */}
          <style>{`
            @keyframes dashFlow {
              to { stroke-dashoffset: -20; }
            }
            .edge-active {
              animation: dashFlow 1.5s linear infinite;
            }
            @keyframes pulseNode {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 1; }
            }
            .node-pulse {
              animation: pulseNode 2.5s ease-in-out infinite;
            }
            @keyframes orbitRing {
              from { transform-origin: center; }
              to { stroke-dashoffset: -50; }
            }
            .orbit-ring {
              animation: dashFlow 4s linear infinite;
            }
          `}</style>
        </defs>

        {/* Background grid (subtle) */}
        <g opacity="0.03">
          {Array.from({ length: 11 }).map((_, i) => (
            <line
              key={`hg-${i}`}
              x1={0}
              y1={i * (height / 10)}
              x2={width}
              y2={i * (height / 10)}
              stroke="white"
              strokeWidth="0.5"
            />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={`vg-${i}`}
              x1={i * (width / 13)}
              y1={0}
              x2={i * (width / 13)}
              y2={height}
              stroke="white"
              strokeWidth="0.5"
            />
          ))}
        </g>

        {/* Center reference circles */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 30}
          fill="none"
          stroke="white"
          strokeWidth="0.3"
          opacity="0.04"
          strokeDasharray="4 4"
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth="0.3"
          opacity="0.06"
        />

        {/* Edges */}
        {edges.map(({ alliance, idx1, idx2, wasBroken }) => {
          const p1 = nodePositions[idx1];
          const p2 = nodePositions[idx2];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          // Curve the line slightly through the center for visual interest
          const controlX = midX + (cy - midY) * 0.15;
          const controlY = midY + (midX - cx) * 0.15;
          const path = `M ${p1.x} ${p1.y} Q ${controlX} ${controlY} ${p2.x} ${p2.y}`;

          if (alliance.active) {
            return (
              <g key={`edge-${alliance.id}`}>
                {/* Glow under active edge */}
                <path
                  d={path}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="6"
                  opacity="0.1"
                  filter="url(#glow-green)"
                />
                {/* Solid line */}
                <path
                  d={path}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2"
                  opacity="0.7"
                />
                {/* Animated particles flowing along the line */}
                <path
                  d={path}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="1.5"
                  strokeDasharray="3 17"
                  className="edge-active"
                  opacity="0.9"
                />
                {/* Power label */}
                <text
                  x={controlX}
                  y={controlY - 8}
                  textAnchor="middle"
                  fill="#4ade80"
                  fontSize="9"
                  fontWeight="600"
                  opacity="0.8"
                >
                  +{((alliance.powerBonus - 1) * 100).toFixed(0)}%
                </text>
              </g>
            );
          }

          // Inactive / broken edge
          return (
            <g key={`edge-${alliance.id}`}>
              <path
                d={path}
                fill="none"
                stroke={wasBroken ? "#ef4444" : "#374151"}
                strokeWidth={wasBroken ? 1.5 : 1}
                strokeDasharray={wasBroken ? "4 4" : "6 4"}
                opacity={wasBroken ? 0.5 : 0.25}
                filter={wasBroken ? "url(#glow-red)" : undefined}
              />
              {wasBroken && (
                <text
                  x={controlX}
                  y={controlY - 6}
                  textAnchor="middle"
                  fill="#ef4444"
                  fontSize="10"
                  opacity="0.6"
                >
                  ×
                </text>
              )}
            </g>
          );
        })}

        {/* Cult nodes */}
        {cults.map(([id, name], i) => {
          const pos = nodePositions[i];
          const color = getCultColor(id, i);
          const rel = cultRelations.get(id) || {
            active: 0,
            broken: 0,
            total: 0,
          };
          const hasActive = rel.active > 0;
          const nodeRadius = hasActive ? 28 : 22;

          return (
            <g key={id}>
              {/* Ambient glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius + 20}
                fill={`url(#node-grad-${id})`}
                className={hasActive ? "node-pulse" : ""}
              />

              {/* Outer orbit ring for active cults */}
              {hasActive && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius + 8}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.8"
                  strokeDasharray="3 8"
                  opacity="0.4"
                  className="orbit-ring"
                />
              )}

              {/* Main node circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={`${color}15`}
                stroke={color}
                strokeWidth={hasActive ? 2 : 1}
                opacity={hasActive ? 1 : 0.7}
              />

              {/* Inner accent ring */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius - 4}
                fill="none"
                stroke={color}
                strokeWidth="0.3"
                opacity="0.3"
              />

              {/* Cult name */}
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="10"
                fontWeight="600"
                style={{ textShadow: `0 0 8px ${color}` }}
              >
                {shortenName(name, hasActive ? 16 : 12)}
              </text>

              {/* Stats below node */}
              <text
                x={pos.x}
                y={pos.y + nodeRadius + 16}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize="9"
              >
                {rel.active > 0 && (
                  <tspan fill="#4ade80">{rel.active} active</tspan>
                )}
                {rel.active > 0 && rel.total > rel.active && " · "}
                {rel.total > rel.active && (
                  <tspan fill="#6b7280">{rel.total - rel.active} past</tspan>
                )}
              </text>

              {/* Betrayal indicator */}
              {rel.broken > 0 && (
                <g>
                  <circle
                    cx={pos.x + nodeRadius - 4}
                    cy={pos.y - nodeRadius + 4}
                    r={7}
                    fill="#1a0505"
                    stroke="#ef4444"
                    strokeWidth="1"
                    opacity="0.9"
                  />
                  <text
                    x={pos.x + nodeRadius - 4}
                    y={pos.y - nodeRadius + 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ef4444"
                    fontSize="8"
                    fontWeight="700"
                  >
                    {rel.broken}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(12, ${height - 50})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke="#22c55e" strokeWidth="2" />
          <text x="22" y="4" fill="#6b7280" fontSize="9">
            Active pact
          </text>
          <line
            x1="0"
            y1="16"
            x2="16"
            y2="16"
            stroke="#374151"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x="22" y="20" fill="#6b7280" fontSize="9">
            Expired
          </text>
          <line
            x1="100"
            y1="0"
            x2="116"
            y2="0"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text x="122" y="4" fill="#6b7280" fontSize="9">
            Broken
          </text>
        </g>
      </svg>
    </div>
  );
}
