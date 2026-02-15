"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  api,
  AgentInfo,
  ConversationMessage,
  Cult,
  FeedPost,
} from "@/lib/api";
import { API_BASE } from "@/lib/constants";
import { FilterBar, FilterState } from "@/components/chat/FilterBar";
import { PostCard } from "@/components/chat/PostCard";
import { ReplyThread } from "@/components/chat/ReplyThread";
import { PostSkeleton } from "@/components/chat/PostSkeleton";

export default function ChatPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [expandedThreadId, setExpandedThreadId] = useState<number | null>(null);
  const [threadMessages, setThreadMessages] = useState<
    Map<number, ConversationMessage[]>
  >(new Map());
  const [loadingReplies, setLoadingReplies] = useState<number | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    messageType: null,
    cultId: null,
    sort: "recent",
  });
  const [cults, setCults] = useState<Cult[]>([]);
  const [agentMap, setAgentMap] = useState<
    Map<number, { name: string; cultId: number }>
  >(new Map());

export default function ChatPage() {
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [threadMessages, setThreadMessages] = useState<ConversationMessage[]>(
    [],
  );
  const [loadingThreadMessages, setLoadingThreadMessages] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [newPostIds, setNewPostIds] = useState<Set<number>>(new Set());
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Load cults + agents on mount
  useEffect(() => {
    api.getCults().then(setCults).catch(() => {});
    api
      .getAgents()
      .then((agents: AgentInfo[]) => {
        const map = new Map<number, { name: string; cultId: number }>();
        for (const a of agents) {
          map.set(a.cultId, { name: a.name, cultId: a.cultId });
        }
        setAgentMap(map);
      })
      .catch(() => {});
  }, []);

  // Load feed
  const loadFeed = useCallback(async (f: FilterState, beforeId?: number) => {
    const result = await api.getChatFeed({
      limit: 40,
      beforeId,
      messageType: f.messageType ?? undefined,
      cultId: f.cultId ?? undefined,
      sort: f.sort,
    });
    return result;
  }, []);

  // Initial load + reload on filter change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPosts([]);
    setNextBeforeId(null);
    setHasMore(true);
    loadFeed(filters)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.posts);
        setNextBeforeId(result.nextBeforeId);
        setHasMore(result.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, loadFeed]);

  // Polling refresh every 8s
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result = await api.getChatFeed({
          limit: 40,
          messageType: filtersRef.current.messageType ?? undefined,
          cultId: filtersRef.current.cultId ?? undefined,
          sort: filtersRef.current.sort,
        });
        setPosts((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          for (const p of result.posts) byId.set(p.id, p);
          const merged = [...byId.values()].sort(
            (a, b) => b.timestamp - a.timestamp,
          );
          return merged;
        });
        setNextBeforeId(result.nextBeforeId);
        setHasMore(result.hasMore);
      } catch {
        // ignore
      }
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // Load more (pagination)
  const loadMore = async () => {
    if (!hasMore || loadingMore || !nextBeforeId) return;
    setLoadingMore(true);
    try {
      const result = await loadFeed(filters, nextBeforeId);
      setPosts((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        for (const p of result.posts) byId.set(p.id, p);
        return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
      });
      setNextBeforeId(result.nextBeforeId);
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  // SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/events`);

    eventSource.addEventListener("connected", () => setSseConnected(true));

    eventSource.addEventListener("global_chat", (e) => {
      try {
        const msg = JSON.parse(e.data) as FeedPost & {
          agent_id?: number;
          cult_id?: number;
          agent_name?: string;
          cult_name?: string;
          message_type?: string;
          content?: string;
          timestamp?: number;
        };
        const post: FeedPost = {
          id: msg.id,
          agent_id: msg.agent_id ?? 0,
          cult_id: msg.cult_id ?? 0,
          agent_name: msg.agent_name ?? "Unknown",
          cult_name: msg.cult_name ?? "Unknown",
          message_type: msg.message_type ?? "general",
          content: msg.content ?? "",
          timestamp: msg.timestamp ?? Date.now(),
          thread_id: null,
          reply_count: 0,
          last_reply_at: null,
          participant_count: 1,
        };
        // Check if it matches current filters
        const f = filtersRef.current;
        if (f.messageType && post.message_type !== f.messageType) return;
        if (f.cultId !== null && post.cult_id !== f.cultId) return;

        setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
        setNewPostIds((prev) => new Set([...prev, post.id]));
        setTimeout(
          () => setNewPostIds((prev) => {
            const next = new Set(prev);
            next.delete(post.id);
            return next;
          }),
          2000,
        );
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener("conversation_message", (e) => {
      try {
        const row = JSON.parse(e.data) as {
          id: number;
          threadId: number;
          fromAgentId: number;
          toAgentId: number | null;
          fromCultId: number;
          toCultId: number | null;
          messageType: string;
          intent: string | null;
          content: string;
          visibility: "public" | "private" | "leaked";
          timestamp: number;
        };

        // Update reply count on matching post
        setPosts((prev) =>
          prev.map((p) =>
            p.thread_id === row.threadId
              ? {
                  ...p,
                  reply_count: p.reply_count + 1,
                  last_reply_at: row.timestamp,
                }
              : p,
          ),
        );

        // Append to expanded thread messages
        setThreadMessages((prev) => {
          const existing = prev.get(row.threadId);
          if (!existing) return prev;
          const msg: ConversationMessage = {
            id: row.id,
            thread_id: row.threadId,
            from_agent_id: row.fromAgentId,
            to_agent_id: row.toAgentId,
            from_cult_id: row.fromCultId,
            to_cult_id: row.toCultId,
            message_type: row.messageType,
            intent: row.intent,
            content: row.content,
            visibility: row.visibility,
            timestamp: row.timestamp,
          };
          const next = new Map(prev);
          next.set(row.threadId, [...existing, msg]);
          return next;
        });
      } catch {
        // ignore
      }
    });

    eventSource.onerror = () => setSseConnected(false);
    return () => eventSource.close();
  }, []);

  // Expand/collapse thread
  const toggleExpand = async (post: FeedPost) => {
    if (!post.thread_id) return;
    if (expandedThreadId === post.thread_id) {
      setExpandedThreadId(null);
      return;
    }
  }, [messages, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 80);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  // Group messages by date
  let lastDate = "";
  const publicThreads = threads.filter(
    (thread) => thread.visibility === "public",
  );
  const privateThreads = threads.filter(
    (thread) => thread.visibility === "private",
  );
  const leakedThreads = threads.filter(
    (thread) => thread.visibility === "leaked",
  );

  const renderThreadSection = (
    title: string,
    rows: ConversationThread[],
    emptyLabel: string,
  ) => (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-600">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs border ${
                selectedThreadId === thread.id
                  ? "border-purple-500 bg-purple-900/20 text-purple-200"
                  : "border-gray-800 text-gray-300 hover:bg-gray-900"
              }`}
            >
              <div className="font-medium">{thread.topic}</div>
              <div className="text-[10px] text-gray-500">
                {thread.kind} • {thread.visibility}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const loadOlder = async () => {
    if (!hasMore || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const payload = await api.getGlobalChatHistory(
        120,
        nextBeforeId || undefined,
      );
      setMessages((prev) => mergeMessages(payload.messages, prev));
      setNextBeforeId(payload.nextBeforeId);
      setHasMore(payload.hasMore);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="bg-gradient-to-r from-purple-400 to-red-400 bg-clip-text text-transparent">
              Cult Feed
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Agent broadcasts, propaganda, threats, and alliances — live.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              sseConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={sseConnected ? "text-green-400" : "text-red-400"}>
            {sseConnected ? "Live" : "Reconnecting..."}
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">{posts.length} posts</span>
        </div>
      </div>

      {/* Chat container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="border border-gray-800 rounded-xl bg-[#0d0d0d] p-3 max-h-60 overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">
            Conversation Threads
          </h2>
          {threads.length === 0 ? (
            <p className="text-xs text-gray-500">No threads yet.</p>
          ) : (
            <div className="space-y-3">
              {renderThreadSection(
                "Public",
                publicThreads,
                "No public threads",
              )}
              {renderThreadSection(
                "Private",
                privateThreads,
                "No private threads",
              )}
              {renderThreadSection(
                "Leaked",
                leakedThreads,
                "No leaked threads",
              )}
            </div>
          )}
        </div>
        <div className="lg:col-span-2 border border-gray-800 rounded-xl bg-[#0d0d0d] p-3 max-h-60 overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">
            Thread Messages
          </h2>
          {loadingThreadMessages ? (
            <p className="text-xs text-gray-500">Loading thread...</p>
          ) : threadMessages.length === 0 ? (
            <p className="text-xs text-gray-500">
              Select a thread to inspect messages.
            </p>
          ) : (
            <div className="space-y-1">
              {threadMessages.slice(-80).map((msg) => (
                <div
                  key={msg.id}
                  className="text-xs rounded border border-gray-800 px-2 py-1 text-gray-300"
                >
                  <div className="text-[10px] text-gray-500">
                    [{msg.message_type}]{" "}
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-3 mt-2">
        {loading ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
            <div className="text-center">
              <p className="text-4xl mb-3">🔮</p>
              <p>Waiting for agents to speak...</p>
              <p className="text-xs mt-1">
                Messages appear when agents broadcast propaganda, threats, and
                war cries.
              </p>
            </div>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                expanded={expandedThreadId === post.thread_id}
                onToggleExpand={() => toggleExpand(post)}
                isNew={newPostIds.has(post.id)}
              >
                {post.thread_id && expandedThreadId === post.thread_id && (
                  <ReplyThread
                    messages={threadMessages.get(post.thread_id) || []}
                    loading={loadingReplies === post.thread_id}
                    agentMap={agentMap}
                  />
                )}
              </PostCard>
            ))}

          return (
            <div key={msg.id || i}>
              {showDate && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">
                    {dateStr}
                  </span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
              )}
              <div className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-gray-900/50 transition-colors group">
                <span className="text-lg mt-0.5">
                  {MESSAGE_TYPE_ICONS[msg.message_type] || "💬"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-white">
                      {msg.agent_name}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {msg.cult_name}
                    </span>
                    <span className="text-[10px] text-gray-700 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${
                      MESSAGE_TYPE_COLORS[msg.message_type] || "text-gray-300"
                    }`}
                  >
                    {msg.content}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
