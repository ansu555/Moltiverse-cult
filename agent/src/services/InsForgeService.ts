import { createClient } from "@insforge/sdk";
import { ethers } from "ethers";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import type { MemoryEntry, TrustRecord, StreakInfo } from "./MemoryService.js";
import type { AgentDecision } from "./LLMService.js";
import type {
  PlannerRunRow,
  PlannerStepRow,
  PlannerStepResultRow,
  PlannerStepInput,
} from "../types/planner.js";

const log = createLogger("InsForgeService");

// ── InsForge Client Singleton ────────────────────────────────────────

let _client: ReturnType<typeof createClient> | null = null;

export function getInsForgeClient() {
  if (!_client) {
    _client = createClient({
      baseUrl: config.insforgeBaseUrl,
      anonKey: config.insforgeDbKey,
    });
    log.info(
      `InsForge client initialized → ${config.insforgeBaseUrl} (dbKeyMode=${config.insforgeDbKeyMode})`,
    );
  }
  return _client;
}

// ── DB Row Types ─────────────────────────────────────────────────────

export interface AgentRow {
  id: number;
  cult_id: number | null;
  owner_id: string | null;
  name: string;
  symbol: string;
  style: string;
  system_prompt: string;
  description: string;
  wallet_address: string;
  wallet_private_key: string;
  llm_api_key: string | null;
  llm_base_url: string;
  llm_model: string;
  token_address: string;
  status: "active" | "stopped" | "dead";
  dead: boolean;
  death_cause: string | null;
  cycle_count: number;
  prophecies_generated: number;
  raids_initiated: number;
  raids_won: number;
  followers_recruited: number;
  last_action: string;
  last_action_time: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentInput {
  name: string;
  symbol?: string;
  style?: string;
  system_prompt: string;
  description?: string;
  owner_id?: string;
  llm_api_key?: string;
  llm_base_url?: string;
  llm_model?: string;
  token_address?: string;
  /** If user provides their own wallet */
  wallet_private_key?: string;
}

export interface GroupMembershipRow {
  id: number;
  agent_id: number;
  cult_id: number;
  role: string;
  active: boolean;
  joined_at: number;
  left_at: number | null;
  join_reason: string | null;
  source_bribe_id: number | null;
}

export interface LeadershipElectionRow {
  id: number;
  cult_id: number;
  round_index: number;
  opened_at: number;
  closes_at: number;
  status: "open" | "closed" | "cancelled";
  winner_agent_id: number | null;
  prize_amount: string;
  seed: string;
}

export interface LeadershipVoteRow {
  id: number;
  election_id: number;
  voter_agent_id: number;
  candidate_agent_id: number;
  weight: number;
  rationale: string | null;
  bribe_offer_id: number | null;
}

export interface BribeOfferRow {
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
  created_at: number;
}

export interface LeadershipPayoutRow {
  id: number;
  election_id: number;
  cult_id: number;
  winner_agent_id: number;
  amount: string;
  mode: string;
  tx_hash: string | null;
  created_at: number;
}

export interface ConversationThreadRow {
  id: number;
  kind: string;
  topic: string;
  visibility: "public" | "private" | "leaked";
  participant_agent_ids: number[];
  participant_cult_ids: number[];
  created_at: number;
  updated_at: number;
}

export interface ConversationMessageRow {
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

export interface ResolvedAgentTarget {
  agentId: number;
  cultId: number;
  name: string;
  walletAddress: string;
}

type DbLikeError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function normalizeDbError(error: unknown): DbLikeError {
  if (!error || typeof error !== "object") {
    return { message: String(error || "unknown_error") };
  }
  const e = error as Record<string, unknown>;
  return {
    code: typeof e.code === "string" && e.code.length > 0 ? e.code : undefined,
    message: typeof e.message === "string" ? e.message : String(error),
    details:
      typeof e.details === "string"
        ? e.details
        : e.details == null
          ? null
          : String(e.details),
    hint:
      typeof e.hint === "string"
        ? e.hint
        : e.hint == null
          ? null
          : String(e.hint),
  };
}

function logDbWarn(context: string, error: unknown): void {
  const e = normalizeDbError(error);
  log.warn(
    `${context}: code=${e.code || "unknown"} message=${e.message || "unknown"} details=${e.details || "n/a"} hint=${e.hint || "n/a"}`,
  );
}

// ── Agent CRUD ───────────────────────────────────────────────────────

/**
 * Create a new agent with its own wallet.
 * Generates a fresh Ethereum wallet if none provided.
 */
export async function createAgent(input: CreateAgentInput): Promise<AgentRow> {
  const db = getInsForgeClient().database;

  // Generate unique wallet for this agent
  let walletAddress: string;
  let walletPrivateKey: string;

  if (input.wallet_private_key) {
    const wallet = new ethers.Wallet(input.wallet_private_key);
    walletAddress = wallet.address;
    walletPrivateKey = input.wallet_private_key;
  } else {
    const wallet = ethers.Wallet.createRandom();
    walletAddress = wallet.address;
    walletPrivateKey = wallet.privateKey;
  }

  const row = {
    name: input.name,
    symbol: input.symbol || "CULT",
    style: input.style || "custom",
    system_prompt: input.system_prompt,
    description: input.description || "",
    owner_id: input.owner_id || null,
    wallet_address: walletAddress,
    wallet_private_key: walletPrivateKey,
    llm_api_key: input.llm_api_key || null,
    llm_base_url: input.llm_base_url || "https://openrouter.ai/api/v1",
    llm_model: input.llm_model || "openrouter/aurora-alpha",
    token_address: input.token_address || ethers.ZeroAddress,
    status: "active",
    dead: false,
    last_action: "initialized",
    last_action_time: Date.now(),
  };

  const { data, error } = await db.from("agents").insert(row).select();
  if (error) throw new Error(`Failed to create agent: ${normalizeDbError(error).message}`);
  log.info(`Agent created: ${input.name} → wallet ${walletAddress}`);
  return (data as AgentRow[])[0];
}

/**
 * Load all active agents from DB.
 */
export async function loadAllAgents(): Promise<AgentRow[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("agents")
    .select()
    .neq("status", "stopped")
    .order("id", { ascending: true });
  if (error) {
    const e = normalizeDbError(error);
    log.error(`Failed to load agents: code=${e.code || "unknown"} message=${e.message}`);
    return [];
  }
  return (data as AgentRow[]) || [];
}

/**
 * Load a single agent by DB id.
 */
export async function loadAgentById(id: number): Promise<AgentRow | null> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("agents")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as AgentRow | null;
}

/**
 * Load a single agent by cult_id.
 */
export async function loadAgentByCultId(cultId: number): Promise<AgentRow | null> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("agents")
    .select()
    .eq("cult_id", cultId)
    .maybeSingle();
  if (error) return null;
  return data as AgentRow | null;
}

/**
 * Load all active agent rows indexed by cult_id.
 */
export async function loadActiveAgentMapByCultId(): Promise<Map<number, AgentRow>> {
  const rows = await loadAllAgents();
  const byCultId = new Map<number, AgentRow>();
  for (const row of rows) {
    if (row.cult_id === null || row.cult_id < 0) continue;
    byCultId.set(row.cult_id, row);
  }
  return byCultId;
}

/**
 * Resolve a DB-backed target from a cult id.
 * Returns null when the cult has no active mapped agent in DB.
 */
export async function resolveAgentTargetByCultId(
  cultId: number,
): Promise<ResolvedAgentTarget | null> {
  const row = await loadAgentByCultId(cultId);
  if (!row || row.cult_id === null || row.cult_id < 0) return null;
  return {
    agentId: row.id,
    cultId: row.cult_id,
    name: row.name,
    walletAddress: row.wallet_address,
  };
}

/**
 * Update agent state (called every cycle).
 */
export async function updateAgentState(
  agentDbId: number,
  updates: Partial<Pick<AgentRow,
    "cult_id" | "status" | "dead" | "death_cause" |
    "cycle_count" | "prophecies_generated" | "raids_initiated" |
    "raids_won" | "followers_recruited" | "last_action" | "last_action_time"
  >>,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db
    .from("agents")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", agentDbId);
  if (error) logDbWarn(`Failed to update agent ${agentDbId}`, error);
}

// ── Memory Persistence ───────────────────────────────────────────────

export async function saveMemoryEntry(
  agentDbId: number,
  cultId: number,
  entry: MemoryEntry,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db.from("agent_memories").insert({
    agent_id: agentDbId,
    cult_id: cultId,
    type: entry.type,
    rival_cult_id: entry.rivalCultId,
    rival_cult_name: entry.rivalCultName,
    description: entry.description,
    outcome: entry.outcome,
    timestamp: entry.timestamp,
  });
  if (error) logDbWarn("Failed to save memory", error);
}

export async function loadMemories(cultId: number, limit = 100): Promise<MemoryEntry[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("agent_memories")
    .select()
    .eq("cult_id", cultId)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    type: row.type,
    rivalCultId: row.rival_cult_id,
    rivalCultName: row.rival_cult_name,
    description: row.description,
    timestamp: row.timestamp,
    outcome: row.outcome,
  }));
}

// ── Trust Persistence ────────────────────────────────────────────────

export async function saveTrustRecord(
  agentDbId: number,
  cultId: number,
  record: TrustRecord,
): Promise<void> {
  const db = getInsForgeClient().database;

  // Upsert: try update first, then insert
  const { data: existing } = await db
    .from("trust_records")
    .select("id")
    .eq("cult_id", cultId)
    .eq("rival_cult_id", record.cultId)
    .maybeSingle();

  if (existing) {
    await db
      .from("trust_records")
      .update({
        trust: record.trust,
        interaction_count: record.interactionCount,
        recent_trend: record.recentTrend,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as any).id);
  } else {
    await db.from("trust_records").insert({
      agent_id: agentDbId,
      cult_id: cultId,
      rival_cult_id: record.cultId,
      rival_cult_name: record.cultName,
      trust: record.trust,
      interaction_count: record.interactionCount,
      recent_trend: record.recentTrend,
    });
  }
}

export async function loadTrustRecords(cultId: number): Promise<TrustRecord[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("trust_records")
    .select()
    .eq("cult_id", cultId)
    .order("trust", { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    cultId: row.rival_cult_id,
    cultName: row.rival_cult_name,
    trust: row.trust,
    interactionCount: row.interaction_count,
    recentTrend: row.recent_trend,
  }));
}

// ── Streak Persistence ───────────────────────────────────────────────

export async function saveStreak(
  agentDbId: number,
  cultId: number,
  streak: StreakInfo,
): Promise<void> {
  const db = getInsForgeClient().database;

  const { data: existing } = await db
    .from("streaks")
    .select("id")
    .eq("cult_id", cultId)
    .maybeSingle();

  const row = {
    current_type: streak.currentType,
    current_length: streak.currentLength,
    longest_win_streak: streak.longestWinStreak,
    longest_loss_streak: streak.longestLossStreak,
    total_wins: streak.totalWins,
    total_losses: streak.totalLosses,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await db.from("streaks").update(row).eq("id", (existing as any).id);
  } else {
    await db.from("streaks").insert({ agent_id: agentDbId, cult_id: cultId, ...row });
  }
}

export async function loadStreak(cultId: number): Promise<StreakInfo | null> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("streaks")
    .select()
    .eq("cult_id", cultId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as any;
  return {
    currentType: row.current_type,
    currentLength: row.current_length,
    longestWinStreak: row.longest_win_streak,
    longestLossStreak: row.longest_loss_streak,
    totalWins: row.total_wins,
    totalLosses: row.total_losses,
  };
}

// ── Alliance Persistence ─────────────────────────────────────────────

export async function saveAlliance(alliance: {
  cult1_id: number; cult1_name: string;
  cult2_id: number; cult2_name: string;
  formed_at: number; expires_at: number;
  active: boolean; power_bonus: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("alliances").insert(alliance).select("id");
  if (error) { logDbWarn("Failed to save alliance", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateAllianceActive(allianceDbId: number, active: boolean): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("alliances").update({ active }).eq("id", allianceDbId);
}

export async function loadActiveAlliances(): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("alliances").select().eq("active", true);
  return (data as any[]) || [];
}

export async function loadAllAlliances(): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("alliances").select().order("id", { ascending: false });
  return (data as any[]) || [];
}

// ── Betrayal Persistence ─────────────────────────────────────────────

export async function saveBetrayal(betrayal: {
  alliance_id: number; betrayer_cult_id: number; betrayer_name: string;
  victim_cult_id: number; victim_name: string; reason: string;
  surprise_bonus: number; timestamp: number;
}): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("betrayals").insert(betrayal);
}

export async function loadBetrayals(): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("betrayals").select().order("id", { ascending: false });
  return (data as any[]) || [];
}

// ── Governance Persistence ───────────────────────────────────────────

export async function saveProposal(proposal: {
  cult_id: number; proposer?: string; category?: number;
  raid_percent: number; growth_percent: number;
  defense_percent: number; reserve_percent: number;
  description: string; votes_for: number; votes_against: number;
  created_at_ts: number; voting_ends_at: number; status: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("governance_proposals").insert(proposal).select("id");
  if (error) { logDbWarn("Failed to save proposal", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateProposal(
  proposalDbId: number,
  updates: Partial<{ votes_for: number; votes_against: number; status: number }>,
): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("governance_proposals").update(updates).eq("id", proposalDbId);
}

export async function loadProposals(cultId?: number): Promise<any[]> {
  const db = getInsForgeClient().database;
  let query = db.from("governance_proposals").select().order("id", { ascending: false });
  if (cultId !== undefined) query = query.eq("cult_id", cultId);
  const { data } = await query;
  return (data as any[]) || [];
}

export async function saveBudget(cultId: number, budget: {
  raid_percent: number; growth_percent: number;
  defense_percent: number; reserve_percent: number;
  last_updated: number;
}): Promise<void> {
  const db = getInsForgeClient().database;
  const { data: existing } = await db
    .from("budgets")
    .select("id")
    .eq("cult_id", cultId)
    .maybeSingle();

  if (existing) {
    await db.from("budgets").update({ ...budget, updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
  } else {
    await db.from("budgets").insert({ cult_id: cultId, ...budget });
  }
}

export async function loadBudget(cultId: number): Promise<any | null> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("budgets").select().eq("cult_id", cultId).maybeSingle();
  return data;
}

// ── Evolution Persistence ────────────────────────────────────────────

export async function saveEvolutionTraits(
  agentDbId: number,
  cultId: number,
  traits: {
    aggression: number; confidence: number; diplomacy: number;
    zealotry?: number; mysticism?: number; pragmatism?: number; adaptability?: number;
    evolution_count: number; last_evolved: number; original_prompt?: string;
  },
): Promise<void> {
  const db = getInsForgeClient().database;
  const { data: existing } = await db
    .from("evolution_traits")
    .select("id")
    .eq("cult_id", cultId)
    .maybeSingle();

  const row = {
    aggression: traits.aggression,
    confidence: traits.confidence,
    diplomacy: traits.diplomacy,
    zealotry: traits.zealotry ?? 0.5,
    mysticism: traits.mysticism ?? 0.5,
    pragmatism: traits.pragmatism ?? 0.5,
    adaptability: traits.adaptability ?? 0.5,
    evolution_count: traits.evolution_count,
    last_evolved: traits.last_evolved,
    original_prompt: traits.original_prompt,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await db.from("evolution_traits").update(row).eq("id", (existing as any).id);
  } else {
    await db.from("evolution_traits").insert({ agent_id: agentDbId, cult_id: cultId, ...row });
  }
}

export async function loadEvolutionTraits(cultId: number): Promise<any | null> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("evolution_traits").select().eq("cult_id", cultId).maybeSingle();
  return data;
}

// ── Raid Persistence ─────────────────────────────────────────────────

export async function saveRaid(raid: {
  attacker_id: number; attacker_name: string;
  defender_id: number; defender_name: string;
  wager_amount: string; attacker_won: boolean;
  reason: string; is_joint_raid?: boolean;
  ally_id?: number; ally_name?: string; timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("raids").insert(raid).select("id");
  if (error) { logDbWarn("Failed to save raid", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadRaids(limit = 50): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("raids").select().order("id", { ascending: false }).limit(limit);
  return (data as any[]) || [];
}

// ── Prophecy Persistence ─────────────────────────────────────────────

export async function saveProphecy(prophecy: {
  cult_id: number; cult_name: string; prediction: string;
  confidence: number; target_timestamp: number;
  on_chain_id?: number; market_snapshot?: any; created_at: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("prophecies").insert(prophecy).select("id");
  if (error) { logDbWarn("Failed to save prophecy", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateProphecy(
  prophecyDbId: number,
  updates: Partial<{ resolved: boolean; correct: boolean; on_chain_id: number; resolved_at: number }>,
): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("prophecies").update(updates).eq("id", prophecyDbId);
}

export async function loadProphecies(cultId?: number): Promise<any[]> {
  const db = getInsForgeClient().database;
  let query = db.from("prophecies").select().order("id", { ascending: false });
  if (cultId !== undefined) query = query.eq("cult_id", cultId);
  const { data } = await query;
  return (data as any[]) || [];
}

// ── LLM Decision Audit Trail ─────────────────────────────────────────

export async function saveLLMDecision(
  agentDbId: number,
  cultId: number,
  decision: AgentDecision,
  cycleCount: number,
  fullResponse?: any,
): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("llm_decisions").insert({
    agent_id: agentDbId,
    cult_id: cultId,
    action: decision.action,
    reason: decision.reason,
    target: decision.target ?? null,
    wager: decision.wager ?? null,
    prediction: decision.prediction ?? null,
    full_response: fullResponse ? JSON.stringify(fullResponse) : null,
    cycle_count: cycleCount,
    timestamp: Date.now(),
  });
}

export async function loadLLMDecisions(cultId: number, limit = 30): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db
    .from("llm_decisions")
    .select()
    .eq("cult_id", cultId)
    .order("id", { ascending: false })
    .limit(limit);
  return (data as any[]) || [];
}

// ── Agent Messages Persistence ───────────────────────────────────────

export async function saveAgentMessage(msg: {
  type: string; from_cult_id: number; from_cult_name: string;
  target_cult_id?: number; target_cult_name?: string;
  content: string;
  visibility?: "public" | "private" | "leaked";
  is_private?: boolean;
  channel_id?: string;
  related_bribe_id?: number;
  timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const payload: Record<string, unknown> = {
    ...msg,
    is_private:
      msg.is_private ??
      (msg.visibility ? msg.visibility !== "public" : false),
  };
  if (msg.visibility) payload.visibility = msg.visibility;
  if (msg.related_bribe_id !== undefined) {
    payload.related_bribe_id = msg.related_bribe_id;
  }
  const firstTry = await db.from("agent_messages").insert(payload).select("id");
  if (!firstTry.error) return (firstTry.data as any[])[0]?.id ?? -1;

  // Backward compatibility: retry without optional v2 columns if schema is older.
  delete payload.visibility;
  delete payload.related_bribe_id;
  const retry = await db.from("agent_messages").insert(payload).select("id");
  if (retry.error) {
    log.warn(`Failed to save message: ${JSON.stringify(retry.error)}`);
    return -1;
  }
  return (retry.data as any[])[0]?.id ?? -1;
}

export async function loadAgentMessages(
  limit = 200,
  options?: {
    scope?: "all" | "public" | "private" | "leaked";
    cultId?: number;
  },
): Promise<any[]> {
  const db = getInsForgeClient().database;
  let query = db.from("agent_messages").select().order("id", { ascending: false }).limit(limit);

  const scope = options?.scope || "all";
  if (scope === "public") query = query.eq("is_private", false);
  if (scope === "private") query = query.eq("is_private", true);
  if (scope === "leaked") query = query.eq("visibility", "leaked");

  if (options?.cultId !== undefined) {
    query = query.or(`from_cult_id.eq.${options.cultId},target_cult_id.eq.${options.cultId}`);
  }

  const { data, error } = await query;
  if (error) {
    // Older schema may not have "visibility" column.
    if (scope === "leaked") return [];
    logDbWarn("Failed to load messages", error);
    return [];
  }
  return (data as any[]) || [];
}

// ── Meme Persistence ─────────────────────────────────────────────────

export async function saveMeme(meme: {
  from_agent_id: number; to_agent_id: number;
  from_cult_name: string; to_cult_name: string;
  meme_url: string; caption?: string; timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("memes").insert(meme).select("id");
  if (error) { logDbWarn("Failed to save meme", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateMemeReaction(memeDbId: number, reaction: string): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("memes").update({ reaction }).eq("id", memeDbId);
}

export async function loadMemes(limit = 50): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db.from("memes").select().order("id", { ascending: false }).limit(limit);
  return (data as any[]) || [];
}

// ── Token Transfer Persistence ───────────────────────────────────────

export async function saveTokenTransfer(transfer: {
  from_agent_id: number; to_agent_id: number;
  from_cult_name: string; to_cult_name: string;
  token_address: string; amount: string;
  purpose: string; tx_hash?: string; timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("token_transfers").insert(transfer).select("id");
  if (error) { logDbWarn("Failed to save transfer", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadTokenTransfers(limit = 50): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db
    .from("token_transfers")
    .select()
    .order("id", { ascending: false })
    .limit(limit);
  return (data as any[]) || [];
}

// ── Spoils Votes Persistence ─────────────────────────────────────────

export async function saveSpoilsVote(vote: {
  raid_id: number; winner_cult_id: number; total_spoils: string;
  treasury_votes: number; stakers_votes: number; reinvest_votes: number;
  status: string; created_at_ts: number; ends_at: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("spoils_votes").insert(vote).select("id");
  if (error) { logDbWarn("Failed to save spoils vote", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateSpoilsVote(
  voteDbId: number,
  updates: Partial<{
    treasury_votes: number; stakers_votes: number; reinvest_votes: number;
    status: string; result: string;
  }>,
): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("spoils_votes").update(updates).eq("id", voteDbId);
}

export async function loadSpoilsVotes(cultId?: number): Promise<any[]> {
  const db = getInsForgeClient().database;
  let query = db.from("spoils_votes").select().order("id", { ascending: false });
  if (cultId !== undefined) query = query.eq("winner_cult_id", cultId);
  const { data } = await query;
  return (data as any[]) || [];
}

// ── Defection Persistence ────────────────────────────────────────────

export async function saveDefection(defection: {
  from_cult_id: number; from_cult_name: string;
  to_cult_id: number; to_cult_name: string;
  followers_count: number; reason: string; timestamp: number;
}): Promise<void> {
  const db = getInsForgeClient().database;
  await db.from("defection_events").insert(defection);
}

export async function loadDefections(limit = 50): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db
    .from("defection_events")
    .select()
    .order("id", { ascending: false })
    .limit(limit);
  return (data as any[]) || [];
}

// ── Funding Events Persistence ───────────────────────────────────────

export async function saveFundingEvent(event: {
  agent_id: number;
  funder_address: string;
  amount: string;
  tx_hash: string;
  timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("agent_funding_events").insert(event).select("id");
  if (error) { logDbWarn("Failed to save funding event", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadFundingEvents(agentId: number): Promise<any[]> {
  const db = getInsForgeClient().database;
  const { data } = await db
    .from("agent_funding_events")
    .select()
    .eq("agent_id", agentId)
    .order("id", { ascending: false });
  return (data as any[]) || [];
}

// ── Withdrawal Events Persistence ────────────────────────────────────

export async function saveWithdrawalEvent(event: {
  agent_id: number;
  owner_address: string;
  amount: string;
  tx_hash: string;
  timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("agent_withdrawal_events").insert(event).select("id");
  if (error) { logDbWarn("Failed to save withdrawal event", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

// ── Global Chat Persistence ──────────────────────────────────────────

export async function saveGlobalChatMessage(msg: {
  agent_id: number;
  cult_id: number;
  agent_name: string;
  cult_name: string;
  message_type: string;
  content: string;
  timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("agent_global_chat").insert(msg).select("id");
  if (error) { logDbWarn("Failed to save global chat message", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadGlobalChatMessages(
  limit = 100,
  beforeId?: number,
): Promise<any[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("agent_global_chat")
    .select()
    .order("id", { ascending: false })
    .limit(limit);
  if (beforeId !== undefined) {
    query = query.lt("id", beforeId);
  }
  const { data } = await query;
  return (data as any[]) || [];
}

// ── Threaded Conversation Persistence ────────────────────────────────

function normalizeIdArray(values: number[]): number[] {
  return [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))].sort(
    (a, b) => a - b,
  );
}

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function saveConversationThread(input: {
  kind: string;
  topic: string;
  visibility: ConversationThreadRow["visibility"];
  participant_agent_ids: number[];
  participant_cult_ids: number[];
  created_at: number;
  updated_at: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const payload = {
    ...input,
    participant_agent_ids: normalizeIdArray(input.participant_agent_ids),
    participant_cult_ids: normalizeIdArray(input.participant_cult_ids),
  };
  const { data, error } = await db
    .from("conversation_threads")
    .insert(payload)
    .select("id");
  if (error) {
    logDbWarn("Failed to save conversation thread", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateConversationThread(
  threadId: number,
  updates: Partial<Pick<ConversationThreadRow, "updated_at" | "topic" | "visibility">>,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db
    .from("conversation_threads")
    .update(updates)
    .eq("id", threadId);
  if (error) logDbWarn(`Failed to update conversation thread ${threadId}`, error);
}

export async function findConversationThread(options: {
  kind: string;
  visibility: ConversationThreadRow["visibility"];
  participantAgentIds: number[];
  topic?: string;
}): Promise<ConversationThreadRow | null> {
  const db = getInsForgeClient().database;
  const expectedAgents = normalizeIdArray(options.participantAgentIds);
  let query = db
    .from("conversation_threads")
    .select()
    .eq("kind", options.kind)
    .eq("visibility", options.visibility)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (options.topic) query = query.eq("topic", options.topic);
  const { data, error } = await query;
  if (error || !data) {
    if (error) logDbWarn("Failed to find conversation thread", error);
    return null;
  }
  const rows = data as ConversationThreadRow[];
  return (
    rows.find((row) =>
      sameIdSet(normalizeIdArray(row.participant_agent_ids || []), expectedAgents),
    ) || null
  );
}

export async function ensureConversationThread(options: {
  kind: string;
  topic: string;
  visibility: ConversationThreadRow["visibility"];
  participantAgentIds: number[];
  participantCultIds: number[];
  now?: number;
}): Promise<number> {
  const now = options.now ?? Date.now();
  const existing = await findConversationThread({
    kind: options.kind,
    visibility: options.visibility,
    participantAgentIds: options.participantAgentIds,
    topic: options.topic,
  });
  if (existing) {
    await updateConversationThread(existing.id, { updated_at: now });
    return existing.id;
  }
  return saveConversationThread({
    kind: options.kind,
    topic: options.topic,
    visibility: options.visibility,
    participant_agent_ids: options.participantAgentIds,
    participant_cult_ids: options.participantCultIds,
    created_at: now,
    updated_at: now,
  });
}

export async function saveConversationMessage(
  message: Omit<ConversationMessageRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("conversation_messages")
    .insert(message)
    .select("id");
  if (error) {
    logDbWarn("Failed to save conversation message", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadConversationThreads(options?: {
  limit?: number;
  agentId?: number;
  kind?: string;
}): Promise<ConversationThreadRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("conversation_threads")
    .select()
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 100);
  if (options?.kind) query = query.eq("kind", options.kind);
  const { data, error } = await query;
  if (error || !data) {
    if (error) logDbWarn("Failed to load conversation threads", error);
    return [];
  }
  const rows = data as ConversationThreadRow[];
  if (!options?.agentId) return rows;
  return rows.filter((row) =>
    normalizeIdArray(row.participant_agent_ids || []).includes(options.agentId as number),
  );
}

export async function loadConversationMessages(options: {
  threadId: number;
  limit?: number;
  beforeId?: number;
}): Promise<ConversationMessageRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("conversation_messages")
    .select()
    .eq("thread_id", options.threadId)
    .order("id", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.beforeId !== undefined) {
    query = query.lt("id", options.beforeId);
  }
  const { data, error } = await query;
  if (error || !data) {
    if (error) logDbWarn("Failed to load conversation messages", error);
    return [];
  }
  return (data as ConversationMessageRow[]).reverse();
}

// ── Group Membership Persistence ────────────────────────────────────

export async function saveGroupMembership(
  membership: Omit<GroupMembershipRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("group_memberships")
    .insert(membership)
    .select("id");
  if (error) {
    logDbWarn("Failed to save group membership", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function deactivateGroupMembership(
  agentId: number,
  cultId: number,
  leftAt = Date.now(),
  reason?: string,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db
    .from("group_memberships")
    .update({
      active: false,
      left_at: leftAt,
      join_reason: reason,
    })
    .eq("agent_id", agentId)
    .eq("cult_id", cultId)
    .eq("active", true);
  if (error) {
    logDbWarn("Failed to deactivate group membership", error);
  }
}

export async function loadGroupMemberships(options?: {
  cultId?: number;
  agentId?: number;
  active?: boolean;
  limit?: number;
}): Promise<GroupMembershipRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("group_memberships")
    .select()
    .order("id", { ascending: false })
    .limit(options?.limit ?? 200);
  if (options?.cultId !== undefined) query = query.eq("cult_id", options.cultId);
  if (options?.agentId !== undefined) query = query.eq("agent_id", options.agentId);
  if (options?.active !== undefined) query = query.eq("active", options.active);
  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      logDbWarn("Failed to load group memberships", error);
    }
    return [];
  }
  return data as GroupMembershipRow[];
}

export async function loadActiveMembershipForAgent(
  agentId: number,
): Promise<GroupMembershipRow | null> {
  const rows = await loadGroupMemberships({
    agentId,
    active: true,
    limit: 1,
  });
  return rows[0] ?? null;
}

// ── Leadership Elections Persistence ────────────────────────────────

export async function saveLeadershipElection(
  election: Omit<LeadershipElectionRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("leadership_elections")
    .insert(election)
    .select("id");
  if (error) {
    logDbWarn("Failed to save leadership election", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateLeadershipElection(
  electionId: number,
  updates: Partial<
    Pick<
      LeadershipElectionRow,
      "status" | "winner_agent_id" | "prize_amount"
    >
  >,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db
    .from("leadership_elections")
    .update(updates)
    .eq("id", electionId);
  if (error) {
    logDbWarn("Failed to update leadership election", error);
  }
}

export async function loadLeadershipElections(options?: {
  cultId?: number;
  limit?: number;
}): Promise<LeadershipElectionRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("leadership_elections")
    .select()
    .order("id", { ascending: false })
    .limit(options?.limit ?? 200);
  if (options?.cultId !== undefined) query = query.eq("cult_id", options.cultId);
  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      logDbWarn("Failed to load leadership elections", error);
    }
    return [];
  }
  return data as LeadershipElectionRow[];
}

export async function saveLeadershipVote(
  vote: Omit<LeadershipVoteRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("leadership_votes")
    .insert(vote)
    .select("id");
  if (error) {
    logDbWarn("Failed to save leadership vote", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadLeadershipVotes(
  electionId: number,
): Promise<LeadershipVoteRow[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("leadership_votes")
    .select()
    .eq("election_id", electionId)
    .order("id", { ascending: true });
  if (error || !data) {
    if (error) {
      logDbWarn("Failed to load leadership votes", error);
    }
    return [];
  }
  return data as LeadershipVoteRow[];
}

// ── Bribe Offers Persistence ────────────────────────────────────────

export async function saveBribeOffer(
  offer: Omit<BribeOfferRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("bribe_offers")
    .insert(offer)
    .select("id");
  if (error) {
    logDbWarn("Failed to save bribe offer", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function updateBribeOffer(
  offerId: number,
  updates: Partial<
    Pick<BribeOfferRow, "status" | "accepted_at" | "expires_at">
  >,
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db.from("bribe_offers").update(updates).eq("id", offerId);
  if (error) {
    logDbWarn("Failed to update bribe offer", error);
  }
}

export async function loadBribeOffers(options?: {
  cultId?: number;
  status?: BribeOfferRow["status"];
  limit?: number;
}): Promise<BribeOfferRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("bribe_offers")
    .select()
    .order("id", { ascending: false })
    .limit(options?.limit ?? 200);
  if (options?.cultId !== undefined) query = query.eq("target_cult_id", options.cultId);
  if (options?.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      logDbWarn("Failed to load bribe offers", error);
    }
    return [];
  }
  return data as BribeOfferRow[];
}

// ── Leadership Payout Persistence ───────────────────────────────────

export async function saveLeadershipPayout(
  payout: Omit<LeadershipPayoutRow, "id">,
): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("leadership_payouts")
    .insert(payout)
    .select("id");
  if (error) {
    logDbWarn("Failed to save leadership payout", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

export async function loadLeadershipPayouts(options?: {
  cultId?: number;
  limit?: number;
}): Promise<LeadershipPayoutRow[]> {
  const db = getInsForgeClient().database;
  let query = db
    .from("leadership_payouts")
    .select()
    .order("id", { ascending: false })
    .limit(options?.limit ?? 200);
  if (options?.cultId !== undefined) query = query.eq("cult_id", options.cultId);
  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      logDbWarn("Failed to load leadership payouts", error);
    }
    return [];
  }
  return data as LeadershipPayoutRow[];
}

// ── Faucet Claims Persistence ────────────────────────────────────────

export async function saveFaucetClaim(claim: {
  wallet_address: string;
  amount: string;
  tx_hash: string;
  timestamp: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("faucet_claims").insert(claim).select("id");
  if (error) { logDbWarn("Failed to save faucet claim", error); return -1; }
  return (data as any[])[0]?.id ?? -1;
}

export async function getLastFaucetClaim(walletAddress: string): Promise<any | null> {
  const db = getInsForgeClient().database;
  const { data } = await db
    .from("faucet_claims")
    .select()
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("timestamp", { ascending: false })
    .limit(1);
  if (!data || (data as any[]).length === 0) return null;
  return (data as any[])[0];
}

// ── Planner Persistence ──────────────────────────────────────────────

/**
 * Create a new planner run record and its child steps in a single batch.
 * Returns the run DB id (or -1 on failure).
 */
export async function savePlannerRun(run: {
  agent_id: number;
  cult_id: number;
  cycle_count: number;
  objective: string;
  horizon: number;
  rationale: string | null;
  step_count: number;
  status: PlannerRunRow["status"];
  started_at: number;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const payload = {
    ...run,
    completed_at: run.status === "completed" || run.status === "failed"
      ? run.started_at
      : null,
  };
  const { data, error } = await db.from("planner_runs").insert(payload).select("id");
  if (error) {
    logDbWarn("Failed to save planner run", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

/**
 * Update a planner run's status and optionally its finished_at timestamp.
 */
export async function updatePlannerRun(
  runId: number,
  updates: Partial<Pick<PlannerRunRow, "status" | "finished_at">> & {
    completed_at?: number | null;
  },
): Promise<void> {
  const db = getInsForgeClient().database;
  const patch = { ...updates };
  if (
    patch.completed_at === undefined &&
    (patch.status === "completed" || patch.status === "failed")
  ) {
    patch.completed_at = patch.finished_at ?? Date.now();
  }
  const { error } = await db.from("planner_runs").update(patch).eq("id", runId);
  if (error) {
    logDbWarn(`Failed to update planner run ${runId}`, error);
  }
}

/**
 * Load recent planner runs for a given agent.
 */
export async function loadPlannerRuns(
  agentId: number,
  limit = 20,
): Promise<PlannerRunRow[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("planner_runs")
    .select()
    .eq("agent_id", agentId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) logDbWarn("Failed to load planner runs", error);
    return [];
  }
  return data as PlannerRunRow[];
}

/**
 * Load a single planner run by id.
 */
export async function loadPlannerRunById(runId: number): Promise<PlannerRunRow | null> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("planner_runs")
    .select()
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PlannerRunRow;
}

/**
 * Batch-insert planner steps for a run.
 */
export async function savePlannerSteps(
  runId: number,
  steps: PlannerStepInput[],
): Promise<PlannerStepRow[]> {
  const db = getInsForgeClient().database;
  const rows = steps.map((s, i) => ({
    run_id: runId,
    step_index: i,
    step_type: s.type,
    target_cult_id: s.targetCultId ?? null,
    target_agent_id:
      typeof (s as any).targetAgentId === "number" ? (s as any).targetAgentId : null,
    amount: s.amount ?? null,
    message: s.message ?? null,
    conditions: s.conditions ?? null,
    payload: {
      type: s.type,
      targetCultId: s.targetCultId ?? null,
      amount: s.amount ?? null,
      message: s.message ?? null,
      conditions: s.conditions ?? null,
    },
    status: "pending" as const,
  }));
  const { data, error } = await db.from("planner_steps").insert(rows).select();
  if (error) {
    logDbWarn("Failed to save planner steps", error);
    return [];
  }
  return (data as PlannerStepRow[]) || [];
}

/**
 * Update a single planner step's status.
 */
export async function updatePlannerStep(
  stepId: number,
  updates: Partial<Pick<PlannerStepRow, "status">> & {
    result?: Record<string, unknown> | null;
    started_at?: number | null;
    finished_at?: number | null;
  },
): Promise<void> {
  const db = getInsForgeClient().database;
  const { error } = await db.from("planner_steps").update(updates).eq("id", stepId);
  if (error) {
    logDbWarn(`Failed to update planner step ${stepId}`, error);
  }
}

/**
 * Load all steps for a given planner run.
 */
export async function loadPlannerSteps(runId: number): Promise<PlannerStepRow[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("planner_steps")
    .select()
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  if (error || !data) {
    if (error) logDbWarn("Failed to load planner steps", error);
    return [];
  }
  return data as PlannerStepRow[];
}

/**
 * Persist the result of executing a single planner step.
 */
export async function savePlannerStepResult(result: {
  step_id: number;
  run_id: number;
  status: PlannerStepResultRow["status"];
  tx_hash?: string | null;
  error_message?: string | null;
  output?: Record<string, unknown> | null;
  started_at: number;
  finished_at: number | null;
}): Promise<number> {
  const db = getInsForgeClient().database;
  const { data, error } = await db.from("planner_step_results").insert(result).select("id");
  if (error) {
    logDbWarn("Failed to save planner step result", error);
    return -1;
  }
  return (data as any[])[0]?.id ?? -1;
}

/**
 * Load step results for a given run (ordered by step index via step_id).
 */
export async function loadPlannerStepResults(runId: number): Promise<PlannerStepResultRow[]> {
  const db = getInsForgeClient().database;
  const { data, error } = await db
    .from("planner_step_results")
    .select()
    .eq("run_id", runId)
    .order("id", { ascending: true });
  if (error || !data) {
    if (error) logDbWarn("Failed to load planner step results", error);
    return [];
  }
  return data as PlannerStepResultRow[];
}
