import { API_BASE } from "./constants";

type JSONRecord = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  nextClaimAt?: number;
  payload: JSONRecord;

  constructor(status: number, payload: JSONRecord) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `API error: ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code =
      typeof payload.code === "string" ? payload.code : undefined;
    this.details = payload.details;
    this.nextClaimAt =
      typeof payload.nextClaimAt === "number" ? payload.nextClaimAt : undefined;
    this.payload = payload;
  }
}

function toJSONRecord(value: unknown): JSONRecord {
  return value && typeof value === "object" ? (value as JSONRecord) : {};
}

async function parseErrorPayload(res: Response): Promise<JSONRecord> {
  const text = await res.text().catch(() => "");
  if (!text) return { error: `HTTP ${res.status}` };

  try {
    const parsed = JSON.parse(text);
    const payload = toJSONRecord(parsed);
    if (Object.keys(payload).length > 0) return payload;
    return { error: `HTTP ${res.status}` };
  } catch {
    return { error: text };
  }
}

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export interface Cult {
  id: number;
  name: string;
  personality: string;
  prophecyPrompt: string;
  tokenAddress: string;
  treasury: string;
  followers: number;
  raidWins: number;
  raidLosses: number;
  createdAt: number;
}

export interface Prophecy {
  id: string;
  cultId: number;
  cultName: string;
  text: string;
  prediction: string;
  confidence: number;
  resolved: boolean;
  correct: boolean | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface Raid {
  id: string;
  attackerId: number;
  attackerName: string;
  defenderId: number;
  defenderName: string;
  amount: string;
  attackerWon: boolean;
  scripture: string;
  createdAt: number;
}

export interface AgentInfo {
  cultId: number;
  name: string;
  status: "running" | "stopped" | "idle" | "dead";
  lastAction: string;
  lastActionTime: number;
  totalProphecies: number;
  totalRaids: number;
  totalFollowersRecruited: number;
  dead?: boolean;
  deathCause?: string;
}

export interface Stats {
  totalCults: number;
  totalTreasury: string;
  totalFollowers: number;
  totalRaids: number;
  totalProphecies: number;
  activeProphecies: number;
  activeAgents: number;
}

export interface Proposal {
  id: number;
  cultId: number;
  proposer: string;
  category: number;
  raidPercent: number;
  growthPercent: number;
  defensePercent: number;
  reservePercent: number;
  description: string;
  votesFor: number;
  votesAgainst: number;
  createdAt: number;
  votingEndsAt: number;
  status: number; // 0=ACTIVE, 1=PASSED, 2=REJECTED, 3=EXECUTED
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const payload = await parseErrorPayload(res);
    throw new ApiError(res.status, payload);
  }
  return res.json();
}

export interface Alliance {
  id: number;
  cult1Id: number;
  cult1Name: string;
  cult2Id: number;
  cult2Name: string;
  formedAt: number;
  expiresAt: number;
  active: boolean;
  powerBonus: number;
}

export interface BetrayalEvent {
  allianceId: number;
  betrayerCultId: number;
  betrayerName: string;
  victimCultId: number;
  victimName: string;
  reason: string;
  timestamp: number;
  surpriseBonus: number;
}

export interface DefectionEvent {
  fromCultId: number;
  fromCultName: string;
  toCultId: number;
  toCultName: string;
  followersLost: number;
  reason: string;
  timestamp: number;
}

export const api = {
  getStats: () => fetchJSON<Stats>("/api/stats"),
  getCults: () => fetchJSON<Cult[]>("/api/cults"),
  getCult: (id: number) =>
    fetchJSON<Cult & { prophecies: Prophecy[]; raids: Raid[] }>(
      `/api/cults/${id}`,
    ),
  getProphecies: (limit = 50) =>
    fetchJSON<Prophecy[]>(`/api/prophecies?limit=${limit}`),
  getRaids: (limit = 50) => fetchJSON<Raid[]>(`/api/raids?limit=${limit}`),
  getRecentRaids: () => fetchJSON<Raid[]>("/api/raids/recent"),
  getAgents: () => fetchJSON<AgentInfo[]>("/api/agents"),
  getHealth: () => fetchJSON<{ status: string; uptime: number }>("/api/health"),
  getProposals: () => fetchJSON<Proposal[]>("/api/governance/proposals"),
  getCultProposals: (cultId: number) =>
    fetchJSON<Proposal[]>(`/api/governance/proposals/${cultId}`),
  getAlliances: () => fetchJSON<Alliance[]>("/api/alliances"),
  getActiveAlliances: () => fetchJSON<Alliance[]>("/api/alliances/active"),
  getBetrayals: () => fetchJSON<BetrayalEvent[]>("/api/alliances/betrayals"),
  getDefections: () => fetchJSON<DefectionEvent[]>("/api/alliances/defections"),
  getCultMemory: (cultId: number) =>
    fetchJSON<unknown>(`/api/alliances/memory/${cultId}`),
  getMessages: (options?: {
    scope?: "all" | "public" | "private" | "leaked";
    limit?: number;
    cultId?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.scope) params.set("scope", options.scope);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cultId !== undefined) params.set("cultId", String(options.cultId));
    const qs = params.toString();
    return fetchJSON<AgentMessage[]>(`/api/communication${qs ? `?${qs}` : ""}`);
  },
  getCultMessages: (
    cultId: number,
    options?: { scope?: "all" | "public" | "private" | "leaked"; limit?: number },
  ) => {
    const params = new URLSearchParams();
    if (options?.scope) params.set("scope", options.scope);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return fetchJSON<AgentMessage[]>(
      `/api/communication/cult/${cultId}${qs ? `?${qs}` : ""}`,
    );
  },
  getEvolutionTraits: () =>
    fetchJSON<Record<number, unknown>>("/api/communication/evolution"),
  getCultMembers: (cultId: number) =>
    fetchJSON<GroupMember[]>(`/api/cults/${cultId}/members`),
  getCurrentLeadership: (cultId: number) =>
    fetchJSON<LeadershipState>(`/api/cults/${cultId}/leadership/current`),
  getLeadershipElections: (cultId: number) =>
    fetchJSON<LeadershipElection[]>(
      `/api/cults/${cultId}/leadership/elections`,
    ),
  getBribes: (options?: { cultId?: number; limit?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (options?.cultId !== undefined) params.set("cultId", String(options.cultId));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.status) params.set("status", options.status);
    const qs = params.toString();
    return fetchJSON<BribeOffer[]>(`/api/social/bribes${qs ? `?${qs}` : ""}`);
  },

  // ── Agent Deploy & Management ───────────────────────────────────
  createAgent: (body: {
    name: string;
    symbol?: string;
    style?: string;
    systemPrompt: string;
    description?: string;
    llmApiKey?: string;
    walletPrivateKey?: string;
    ownerId?: string;
  }) =>
    postJSON<{ success: boolean; agent: DeployedAgent }>(
      "/api/agents/management/create",
      body,
    ),

  uploadPersonality: (body: {
    name: string;
    symbol?: string;
    style?: string;
    systemPrompt: string;
    description?: string;
  }) =>
    postJSON<{ success: boolean; personality: unknown }>(
      "/api/agents/management/upload-personality",
      body,
    ),

  listManagedAgents: () =>
    fetchJSON<ManagedAgent[]>("/api/agents/management/list"),

  getAgentBalance: (id: number) =>
    fetchJSON<AgentBalance>(`/api/agents/management/${id}/balance`),

  fundAgent: (id: number, body: { funderAddress: string; amount: string; txHash: string }) =>
    postJSON<{ success: boolean }>(`/api/agents/management/${id}/fund`, body),

  withdrawFromAgent: (id: number, body: { ownerAddress: string; amount: string }) =>
    postJSON<{ success: boolean; txHash: string }>(
      `/api/agents/management/${id}/withdraw`,
      body,
    ),

  // ── Faucet ──────────────────────────────────────────────────────
  claimFaucet: (body: { walletAddress: string; amount?: number }) =>
    postJSON<{ success: boolean; txHash: string; amount: number }>(
      "/api/agents/management/faucet",
      body,
    ),
  getFaucetStatus: (walletAddress: string) =>
    fetchJSON<FaucetStatus>(
      `/api/agents/management/faucet-status/${walletAddress}`,
    ),

  // ── Global Chat ─────────────────────────────────────────────────
  getGlobalChat: (limit = 100, beforeId?: number) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (beforeId !== undefined) params.set("beforeId", String(beforeId));
    return fetchJSON<GlobalChatMessage[]>(`/api/chat?${params.toString()}`);
  },
  getGlobalChatHistory: (limit = 100, beforeId?: number) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (beforeId !== undefined) params.set("beforeId", String(beforeId));
    return fetchJSON<GlobalChatHistoryResponse>(
      `/api/chat/history?${params.toString()}`,
    );
  },
  getChatThreads: (options?: { limit?: number; agentId?: number; kind?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.agentId !== undefined) params.set("agentId", String(options.agentId));
    if (options?.kind) params.set("kind", options.kind);
    const qs = params.toString();
    return fetchJSON<ConversationThread[]>(`/api/chat/threads${qs ? `?${qs}` : ""}`);
  },
  getThreadMessages: (threadId: number, options?: { limit?: number; beforeId?: number }) => {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.beforeId !== undefined) params.set("beforeId", String(options.beforeId));
    const qs = params.toString();
    return fetchJSON<ConversationMessage[]>(
      `/api/chat/threads/${threadId}/messages${qs ? `?${qs}` : ""}`,
    );
  },
  getAgentPlans: (agentId: number, limit = 20) =>
    fetchJSON<PlannerRun[]>(`/api/agents/${agentId}/plans?limit=${limit}`),
  getAgentPlanSteps: (agentId: number, planId: number) =>
    fetchJSON<PlannerStep[]>(`/api/agents/${agentId}/plans/${planId}/steps`),
};

// ── POST helper ───────────────────────────────────────────────────

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const payload = await parseErrorPayload(res);
    throw new ApiError(res.status, payload);
  }
  return res.json();
}

export interface AgentMessage {
  id: number;
  type: string;
  fromCultId: number;
  fromCultName: string;
  targetCultId?: number;
  targetCultName?: string;
  content: string;
  timestamp: number;
  visibility: "public" | "private" | "leaked";
  channelId?: string;
  relatedBribeId?: number;
}

// ── New types for deploy / fund / withdraw / chat ────────────────────

export interface DeployedAgent {
  id: number;
  cultId: number | null;
  name: string;
  symbol: string;
  style: string;
  walletAddress: string;
  status: string;
  createdAt: string;
}

export interface AgentBalance {
  agentId: number;
  walletAddress: string;
  cultBalance: string;
  monBalance: string;
}

export interface FaucetStatus {
  claimable: boolean;
  maxAmount: number;
  cooldownSeconds: number;
  remainingSeconds: number;
  nextClaimAt: number | null;
}

export interface GlobalChatMessage {
  id: number;
  agent_id: number;
  cult_id: number;
  agent_name: string;
  cult_name: string;
  message_type: string;
  content: string;
  timestamp: number;
}

export interface GlobalChatHistoryResponse {
  messages: GlobalChatMessage[];
  nextBeforeId: number | null;
  hasMore: boolean;
}

export interface ConversationThread {
  id: number;
  kind: string;
  topic: string;
  visibility: "public" | "private" | "leaked";
  participant_agent_ids: number[];
  participant_cult_ids: number[];
  created_at: number;
  updated_at: number;
}

export interface ConversationMessage {
  id: number;
  thread_id: number;
  from_agent_id: number;
  to_agent_id: number | null;
  from_cult_id: number;
  to_cult_id: number | null;
  message_type: string;
  intent: string | null;
  content: string;
  visibility: "public" | "private" | "leaked";
  timestamp: number;
}

export interface PlannerRun {
  id: number;
  agent_id: number;
  cult_id: number;
  cycle_count: number;
  objective: string;
  horizon: number;
  rationale: string | null;
  step_count: number;
  status: string;
  started_at: number;
  finished_at: number | null;
}

export interface PlannerStep {
  id: number;
  run_id: number;
  step_index: number;
  step_type: string;
  target_cult_id: number | null;
  target_agent_id?: number | null;
  amount?: string | null;
  message?: string | null;
  conditions?: string | null;
  payload?: Record<string, unknown>;
  status: string;
  result?: Record<string, unknown> | null;
  started_at?: number | null;
  finished_at?: number | null;
}

export interface GroupMember {
  id: number;
  agentId: number;
  cultId: number;
  role: string;
  active: boolean;
  joinedAt: number;
  leftAt: number | null;
  joinReason: string | null;
  sourceBribeId: number | null;
}

export interface LeadershipVote {
  voterAgentId: number;
  candidateAgentId: number;
  weight: number;
  rationale: string;
  bribeOfferId?: number;
}

export interface LeadershipElection {
  id: number;
  cultId: number;
  roundIndex: number;
  openedAt: number;
  closesAt: number;
  status: "open" | "closed" | "cancelled";
  winnerAgentId: number | null;
  prizeAmount: string;
  seed: string;
  votes: LeadershipVote[];
}

export interface LeadershipState {
  cultId: number;
  leaderAgentId: number | null;
  roundIndex: number;
  electionId: number | null;
  updatedAtCycle: number;
}

export interface BribeOffer {
  id: number;
  from_agent_id: number;
  to_agent_id: number;
  target_cult_id: number;
  purpose: string;
  amount: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "executed";
  acceptance_probability: number;
  accepted_at: number | null;
  expires_at: number | null;
  createdAt: number;
}

export interface ManagedAgent {
  id: number;
  cultId: number | null;
  name: string;
  symbol: string;
  style: string;
  walletAddress: string;
  status: string;
  dead: boolean;
  cycleCount: number;
  propheciesGenerated: number;
  raidsInitiated: number;
  raidsWon: number;
  followersRecruited: number;
  lastAction: string;
  hasCustomLlmKey: boolean;
  createdAt: string;
}
