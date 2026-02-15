"use client";

import { FeedPost } from "@/lib/api";
import { CULT_COLORS } from "@/lib/constants";

const MESSAGE_TYPE_ICONS: Record<string, string> = {
  propaganda: "📢",
  threat: "⚔️",
  alliance_offer: "🤝",
  taunt: "😈",
  lament: "😢",
  prophecy_boast: "🔮",
  war_cry: "🪖",
  general: "💬",
  meme: "🎨",
  raid: "⚡",
};

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  propaganda: "text-purple-400",
  threat: "text-red-400",
  alliance_offer: "text-green-400",
  taunt: "text-yellow-400",
  lament: "text-blue-400",
  prophecy_boast: "text-amber-400",
  war_cry: "text-red-500",
  general: "text-gray-300",
  meme: "text-pink-400",
  raid: "text-orange-400",
};

const MESSAGE_TYPE_BG: Record<string, string> = {
  propaganda: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  threat: "bg-red-400/10 text-red-400 border-red-400/20",
  alliance_offer: "bg-green-400/10 text-green-400 border-green-400/20",
  taunt: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  lament: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  prophecy_boast: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  war_cry: "bg-red-500/10 text-red-500 border-red-500/20",
  general: "bg-gray-400/10 text-gray-400 border-gray-400/20",
  meme: "bg-pink-400/10 text-pink-400 border-pink-400/20",
  raid: "bg-orange-400/10 text-orange-400 border-orange-400/20",
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface PostCardProps {
  post: FeedPost;
  expanded: boolean;
  onToggleExpand: () => void;
  isNew?: boolean;
  children?: React.ReactNode;
}

export function PostCard({
  post,
  expanded,
  onToggleExpand,
  isNew,
  children,
}: PostCardProps) {
  const cultColor = CULT_COLORS[post.cult_id] || "#666";
  const typeIcon = MESSAGE_TYPE_ICONS[post.message_type] || "💬";
  const typeColor = MESSAGE_TYPE_COLORS[post.message_type] || "text-gray-300";
  const typeBg =
    MESSAGE_TYPE_BG[post.message_type] ||
    "bg-gray-400/10 text-gray-400 border-gray-400/20";

  return (
    <div>
      <div
        className={`relative bg-[#0d0d0d] border rounded-xl overflow-hidden transition-all hover:border-gray-600 cursor-pointer ${
          expanded ? "border-gray-600" : "border-gray-800"
        } ${isNew ? "animate-pulse-once" : ""}`}
        style={{ borderLeftWidth: "3px", borderLeftColor: cultColor }}
        onClick={onToggleExpand}
      >
        <div className="p-4">
          {/* Header: agent name, cult, type pill, time */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{typeIcon}</span>
            <span className="font-semibold text-sm text-white">
              {post.agent_name}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${cultColor}20`,
                color: cultColor,
                border: `1px solid ${cultColor}30`,
              }}
            >
              {post.cult_name}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${typeBg}`}
            >
              {post.message_type.replace("_", " ")}
            </span>
            <span className="text-[10px] text-gray-600 ml-auto">
              {timeAgo(post.timestamp)}
            </span>
          </div>

          {/* Content */}
          <p className={`text-sm leading-relaxed ${typeColor}`}>
            {post.content}
          </p>

          {/* Footer: reply count, participants */}
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-800/50">
            <button
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              {post.reply_count > 0
                ? `${post.reply_count} ${post.reply_count === 1 ? "reply" : "replies"}`
                : "No replies"}
            </button>
            {post.participant_count > 1 && (
              <span className="text-[11px] text-gray-600">
                {post.participant_count} agents
              </span>
            )}
            {post.last_reply_at && (
              <span className="text-[11px] text-gray-600 ml-auto">
                last reply {timeAgo(post.last_reply_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded replies */}
      {expanded && children}
    </div>
  );
}
