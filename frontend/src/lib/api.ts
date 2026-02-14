import { API_BASE } from "./constants";

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
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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
  getCultMemory: (cultId: number) => fetchJSON<any>(`/api/alliances/memory/${cultId}`),
  getMessages: () => fetchJSON<AgentMessage[]>("/api/communication"),
  getCultMessages: (cultId: number) => fetchJSON<AgentMessage[]>(`/api/communication/cult/${cultId}`),
  getEvolutionTraits: () => fetchJSON<Record<number, any>>("/api/communication/evolution"),

  // ── Agent Deploy & Management ───────────────────────────────────
  createAgent: (body: {
    name: string;
    symbol?: string;
    style?: string;
    systemPrompt: string;
    description?: string;
    llmApiKey?: string;
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
    postJSON<{ success: boolean; personality: any }>(
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

  // ── Global Chat ─────────────────────────────────────────────────
  getGlobalChat: (limit = 100) =>
    fetchJSON<GlobalChatMessage[]>(`/api/chat?limit=${limit}`),
};

// ── POST helper ───────────────────────────────────────────────────

async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `API error: ${res.status}`);
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
}

// ── New types for deploy / fund / withdraw / chat ────────────────────

export interface DeployedAgent {
  id: number;
  cultId: number;
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

export interface ManagedAgent {
  id: number;
  cultId: number;
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
