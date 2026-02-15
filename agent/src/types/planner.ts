/**
 * Planner types for the free-will multi-step agent architecture.
 *
 * Replaces the single-action AgentDecision bottleneck with a
 * multi-step PlannerPlan → PlannerStep → ExecutionResult pipeline.
 */

// ── Step types an agent can include in a plan ────────────────────────

export type PlannerStepType =
  | "talk_public"    // broadcast a public message
  | "talk_private"   // send a private/whisper message to a specific agent
  | "ally"           // propose or accept an alliance
  | "betray"         // betray an existing alliance
  | "bribe"          // send tokens to influence another agent
  | "raid"           // attack a rival cult
  | "recruit"        // attempt follower conversion
  | "govern"         // submit a governance proposal
  | "coup"           // attempt a coup against a rival
  | "leak"           // leak private info publicly
  | "meme"           // send a meme to a rival
  | "wait"           // deliberate inaction / observation
  | "idle";          // fallback / no-op

// ── Plan (LLM output for a single cycle) ─────────────────────────────

export interface PlannerPlan {
  objective: string;       // high-level goal for this cycle
  horizon: number;         // how many steps in this plan (1–5)
  steps: PlannerStepInput[];
  rationale: string;       // LLM reasoning for the plan
}

export interface PlannerStepInput {
  type: PlannerStepType;
  targetCultId?: number;   // target cult for raid/ally/bribe/etc.
  amount?: string;         // token amount for bribe / wager for raid
  message?: string;        // content for talk_public/talk_private/meme
  conditions?: string;     // optional pre-conditions the LLM sets
}

// ── DB Row Types ─────────────────────────────────────────────────────

export interface PlannerRunRow {
  id: number;
  agent_id: number;
  cult_id: number;
  cycle_count: number;
  objective: string;
  horizon: number;
  rationale: string | null;
  step_count: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at: number;
  finished_at: number | null;
  created_at: string;
}

export interface PlannerStepRow {
  id: number;
  run_id: number;
  step_index: number;
  step_type: string;
  target_cult_id: number | null;
  amount: string | null;
  message: string | null;
  conditions: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  created_at: string;
}

export interface PlannerStepResultRow {
  id: number;
  step_id: number;
  run_id: number;
  status: "success" | "failure" | "skipped" | "error";
  tx_hash: string | null;
  error_message: string | null;
  output: Record<string, unknown> | null;
  started_at: number;
  finished_at: number | null;
  created_at: string;
}

// ── Runtime execution result (returned by step executor) ─────────────

export interface ExecutionResult {
  stepIndex: number;
  status: "success" | "failure" | "skipped" | "error";
  txHash?: string;
  error?: string;
  output?: Record<string, unknown>;
}
