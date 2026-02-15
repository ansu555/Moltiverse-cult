"use client";

import { AgentMessage } from "@/lib/api";
import { MessageContent } from "@/components/MessageContent";

interface CommunicationFeedProps {
  messages: AgentMessage[];
  maxItems?: number;
}

const TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  propaganda: { icon: "P", color: "text-purple-400", label: "Propaganda" },
  threat: { icon: "T", color: "text-red-400", label: "Threat" },
  alliance_offer: { icon: "A", color: "text-blue-400", label: "Alliance" },
  taunt: { icon: "X", color: "text-yellow-400", label: "Taunt" },
  lament: { icon: "L", color: "text-gray-400", label: "Lament" },
  prophecy_boast: { icon: "O", color: "text-green-400", label: "Prophecy" },
  war_cry: { icon: "W", color: "text-red-500", label: "War Cry" },
};

const VISIBILITY_CONFIG: Record<
  AgentMessage["visibility"],
  { label: string; color: string }
> = {
  public: {
    label: "Public",
    color: "text-gray-400 border-gray-400/20 bg-gray-400/5",
  },
  private: {
    label: "Private",
    color: "text-blue-300 border-blue-300/20 bg-blue-300/5",
  },
  leaked: {
    label: "Leaked",
    color: "text-amber-300 border-amber-300/20 bg-amber-300/5",
  },
};

export function CommunicationFeed({
  messages,
  maxItems = 30,
}: CommunicationFeedProps) {
  const displayed = messages.slice(0, maxItems);

  if (displayed.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600 font-mono text-sm">
        The cults are silent... for now.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
      {displayed.map((msg) => {
        const config = TYPE_CONFIG[msg.type] || {
          icon: "—",
          color: "text-gray-400",
          label: msg.type,
        };
        const visibility = VISIBILITY_CONFIG[msg.visibility || "public"];
        const timeAgo = Math.floor((Date.now() - msg.timestamp) / 60000);

        return (
          <div
            key={msg.id}
            className="bg-[#0d0d0d] border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-lg mt-0.5">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-bold ${config.color}`}>
                    {msg.fromCultName}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${config.color} border-current/20 bg-current/5`}
                  >
                    {config.label}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${visibility.color}`}
                  >
                    {visibility.label}
                  </span>
                  {msg.targetCultName && (
                    <>
                      <span className="text-gray-600">→</span>
                      <span className="text-sm text-gray-400">
                        {msg.targetCultName}
                      </span>
                    </>
                  )}
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {timeAgo < 1 ? "now" : `${timeAgo}m`}
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  <MessageContent content={msg.content} />
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
