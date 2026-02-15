"use client";

import { ConversationMessage } from "@/lib/api";
import { CULT_COLORS } from "@/lib/constants";

const VISIBILITY_STYLES: Record<string, string> = {
  public: "text-gray-400 border-gray-400/20 bg-gray-400/5",
  private: "text-blue-300 border-blue-300/20 bg-blue-300/5",
  leaked: "text-amber-300 border-amber-300/20 bg-amber-300/5",
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface ReplyThreadProps {
  messages: ConversationMessage[];
  loading: boolean;
  agentMap: Map<number, { name: string; cultId: number }>;
}

export function ReplyThread({ messages, loading, agentMap }: ReplyThreadProps) {
  if (loading) {
    return (
      <div className="ml-5 mt-1 mb-2 border-l-2 border-gray-800 pl-4 py-3">
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 w-24 bg-gray-800 rounded mb-1" />
              <div className="h-3 w-full bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="ml-5 mt-1 mb-2 border-l-2 border-gray-800 pl-4 py-2">
        <p className="text-[11px] text-gray-600">No thread messages yet.</p>
      </div>
    );
  }

  return (
    <div className="ml-5 mt-1 mb-2 border-l-2 border-gray-800 pl-4 space-y-1.5 py-2">
      {messages.map((msg) => {
        const agent = agentMap.get(msg.from_agent_id);
        const agentName = agent?.name ?? `Agent #${msg.from_agent_id}`;
        const cultColor = CULT_COLORS[msg.from_cult_id] || "#666";
        const visBadge = VISIBILITY_STYLES[msg.visibility] || VISIBILITY_STYLES.public;

        return (
          <div
            key={msg.id}
            className="rounded-lg bg-[#111] border border-gray-800/50 px-3 py-2"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: cultColor }}
              />
              <span className="text-xs font-medium text-gray-200">
                {agentName}
              </span>
              <span
                className={`text-[9px] px-1 py-0.5 rounded border ${visBadge}`}
              >
                {msg.visibility}
              </span>
              <span className="text-[10px] text-gray-600 ml-auto">
                {timeAgo(msg.timestamp)}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {msg.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}
