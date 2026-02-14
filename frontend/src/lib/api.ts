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
  status: "running" | "stopped" | "idle";
  lastAction: string;
  lastActionTime: number;
  totalProphecies: number;
  totalRaids: number;
  totalFollowersRecruited: number;
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
};

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
