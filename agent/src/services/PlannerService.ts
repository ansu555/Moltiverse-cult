import type { AgentDecision, LLMService } from "./LLMService.js";
import {
  savePlannerRun,
  savePlannerStepResult,
  savePlannerSteps,
  updatePlannerRun,
  updatePlannerStep,
} from "./InsForgeService.js";
import type { ExecutionResult, PlannerPlan, PlannerStepInput } from "../types/planner.js";
import { createLogger } from "../utils/logger.js";
import { broadcastEvent } from "../api/server.js";

const log = createLogger("PlannerService");

export interface StepExecutorContext {
  cultId: number;
  agentDbId: number;
  cultName: string;
  systemPrompt: string;
  cultState: {
    id: number;
    name: string;
    followerCount: number;
    raidWins: number;
    treasuryBalance: bigint;
  };
  rivals: Array<{
    id: number;
    name: string;
    followerCount: number;
    raidWins: number;
    treasuryBalance: bigint;
  }>;
  executeTalkPublic: (message: string) => Promise<boolean>;
  executeTalkPrivate: (targetCultId: number, message: string) => Promise<boolean>;
  executeAlly: (targetCultId: number) => Promise<boolean>;
  executeBetray: (reason: string) => Promise<void>;
  executeBribe: (targetCultId: number, amount: string) => Promise<boolean>;
  executeRaid: (targetCultId: number, wagerPct?: number) => Promise<void>;
  executeRecruit: (targetCultId?: number) => Promise<void>;
  executeGovern: () => Promise<void>;
  executeCoup: () => Promise<void>;
  executeLeak: () => Promise<void>;
  executeMeme: (targetCultId?: number, caption?: string) => Promise<void>;
}

interface PlannerContext {
  ownTreasury: number;
  ownFollowers: number;
  ownRaidWins: number;
  rivals: Array<{
    id: number;
    name: string;
    treasury: number;
    followers: number;
    raidWins: number;
  }>;
  recentProphecies?: number;
  marketTrend: string;
  memoryContext?: string;
  trustGraph?: string;
}

function planStepToDecisionAction(type: PlannerStepInput["type"]): AgentDecision["action"] {
  switch (type) {
    case "raid":
      return "raid";
    case "recruit":
      return "recruit";
    case "govern":
      return "govern";
    case "ally":
      return "ally";
    case "betray":
      return "betray";
    case "coup":
      return "coup";
    case "leak":
      return "leak";
    case "meme":
      return "meme";
    case "bribe":
      return "bribe";
    default:
      return "idle";
  }
}

function resultStatusToRowStatus(status: ExecutionResult["status"]) {
  switch (status) {
    case "success":
      return "completed";
    case "skipped":
      return "skipped";
    case "failure":
    case "error":
    default:
      return "failed";
  }
}

export class PlannerService {
  constructor(private readonly llm: LLMService) {}

  async createPlan(input: {
    systemPrompt: string;
    cultName: string;
    context: PlannerContext;
    cycleCount: number;
  }): Promise<{ plan: PlannerPlan; primaryDecision: AgentDecision }> {
    const llmPlan = await this.llm.generatePlan(
      input.systemPrompt,
      input.cultName,
      {
        ownTreasury: input.context.ownTreasury,
        ownFollowers: input.context.ownFollowers,
        ownRaidWins: input.context.ownRaidWins,
        rivals: input.context.rivals,
        marketTrend: input.context.marketTrend,
        memoryContext: input.context.memoryContext,
        trustGraph: input.context.trustGraph,
      },
      input.cycleCount,
    );

    const steps = [...(llmPlan.steps || [])].slice(0, 5);

    // Keep planner multi-step even under weak LLM outputs.
    if (steps.length < 2) {
      steps.push({
        type: "wait",
        conditions: "planner_minimum_two_steps",
      });
    }

    const plan: PlannerPlan = {
      objective: llmPlan.objective || "observe_and_adapt",
      horizon: Math.max(llmPlan.horizon || steps.length, steps.length),
      steps,
      rationale: llmPlan.rationale || "autonomous_cycle_decision",
    };

    const primaryStep =
      steps.find((s) => !["talk_public", "talk_private", "wait", "idle"].includes(s.type)) ||
      steps[0];
    const primaryDecision: AgentDecision = {
      action: planStepToDecisionAction(primaryStep?.type || "idle"),
      reason: plan.rationale || plan.objective,
      target:
        typeof primaryStep?.targetCultId === "number"
          ? primaryStep.targetCultId
          : undefined,
      wager:
        typeof primaryStep?.amount === "string"
          ? Number.parseFloat(primaryStep.amount)
          : undefined,
      memeUrl: primaryStep?.type === "meme" ? primaryStep.message : undefined,
      bribeAmount: primaryStep?.type === "bribe" ? primaryStep.amount : undefined,
    };

    return { plan, primaryDecision };
  }

  async planCycle(
    executorCtx: StepExecutorContext,
    context: PlannerContext,
    cycleCount: number,
  ): Promise<ExecutionResult[]> {
    const { plan, primaryDecision } = await this.createPlan({
      systemPrompt: executorCtx.systemPrompt,
      cultName: executorCtx.cultName,
      context,
      cycleCount,
    });

    log.info(
      `Plan built for ${executorCtx.cultName} (cycle ${cycleCount}): objective=${plan.objective}, steps=${plan.steps.length}, primary=${primaryDecision.action}`,
    );

    let runId = -1;
    let persistedSteps: Array<{ id: number }> = [];
    if (executorCtx.agentDbId > 0) {
      runId = await savePlannerRun({
        agent_id: executorCtx.agentDbId,
        cult_id: executorCtx.cultId,
        cycle_count: cycleCount,
        objective: plan.objective,
        horizon: plan.horizon,
        rationale: plan.rationale || null,
        step_count: plan.steps.length,
        status: "running",
        started_at: Date.now(),
      });
      if (runId > 0) {
        persistedSteps = await savePlannerSteps(runId, plan.steps);
      }
    }

    const results: ExecutionResult[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const stepDbId = persistedSteps[i]?.id;
      const startedAt = Date.now();

      if (stepDbId) {
        await updatePlannerStep(stepDbId, { status: "running", started_at: startedAt });
      }

      broadcastEvent("planner_step_started", {
        runId,
        stepDbId: stepDbId ?? null,
        stepIndex: i,
        stepType: step.type,
        cultId: executorCtx.cultId,
      });

      let result: ExecutionResult;
      try {
        result = await this.executeStep(step, i, executorCtx);
      } catch (error: any) {
        result = {
          stepIndex: i,
          status: "error",
          error: error?.message || "step_execution_failed",
        };
      }

      const finishedAt = Date.now();
      results.push(result);

      if (stepDbId) {
        await updatePlannerStep(stepDbId, {
          status: resultStatusToRowStatus(result.status),
          result: {
            status: result.status,
            txHash: result.txHash ?? null,
            error: result.error ?? null,
            output: result.output ?? null,
          },
          finished_at: finishedAt,
        });
      }

      if (runId > 0 && stepDbId) {
        await savePlannerStepResult({
          step_id: stepDbId,
          run_id: runId,
          status:
            result.status === "success"
              ? "success"
              : result.status === "skipped"
                ? "skipped"
                : "error",
          tx_hash: result.txHash ?? null,
          error_message: result.error ?? null,
          output: result.output ?? null,
          started_at: startedAt,
          finished_at: finishedAt,
        });
      }

      if (result.status === "failure" || result.status === "error") {
        broadcastEvent("planner_step_failed", {
          runId,
          stepDbId: stepDbId ?? null,
          stepIndex: i,
          stepType: step.type,
          cultId: executorCtx.cultId,
          status: result.status,
          error: result.error ?? null,
        });
      } else {
        broadcastEvent("planner_step_completed", {
          runId,
          stepDbId: stepDbId ?? null,
          stepIndex: i,
          stepType: step.type,
          cultId: executorCtx.cultId,
          status: result.status,
          error: result.error ?? null,
        });
      }
    }

    if (runId > 0) {
      const hasFailure = results.some((r) => r.status === "failure" || r.status === "error");
      await updatePlannerRun(runId, {
        status: hasFailure ? "failed" : "completed",
        finished_at: Date.now(),
      });
    }

    // Log plan execution summary
    log.info(`✅ PLAN EXECUTION for ${executorCtx.cultName}:`);
    results.forEach((r, i) => {
      const statusEmoji = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌";
      const errorMsg = r.error ? ` (${r.error})` : '';
      const txMsg = r.txHash ? ` [tx: ${r.txHash.slice(0, 10)}...]` : '';
      log.info(`  ${statusEmoji} Step ${i + 1}: ${r.status}${errorMsg}${txMsg}`);
    });

    return results;
  }

  private async executeStep(
    step: PlannerStepInput,
    stepIndex: number,
    ctx: StepExecutorContext,
  ): Promise<ExecutionResult> {
    switch (step.type) {
      case "talk_public":
        if (!(await ctx.executeTalkPublic(step.message || `${ctx.cultName} broadcasts to all rivals.`))) {
          return { stepIndex, status: "skipped", error: "message_suppressed" };
        }
        return { stepIndex, status: "success", output: { kind: "talk_public" } };
      case "talk_private": {
        if (step.targetCultId === undefined) {
          return { stepIndex, status: "skipped", error: "missing_target_cult_id" };
        }
        if (!(await ctx.executeTalkPrivate(step.targetCultId, step.message || "Let us negotiate."))) {
          return { stepIndex, status: "skipped", error: "message_suppressed" };
        }
        return { stepIndex, status: "success", output: { kind: "talk_private" } };
      }
      case "ally":
        if (step.targetCultId === undefined) {
          return { stepIndex, status: "skipped", error: "missing_target_cult_id" };
        }
        if (!(await ctx.executeAlly(step.targetCultId))) {
          return { stepIndex, status: "skipped", error: "social_gate_or_alliance_rejected" };
        }
        return { stepIndex, status: "success", output: { kind: "ally" } };
      case "betray":
        await ctx.executeBetray(step.conditions || "Strategic betrayal");
        return { stepIndex, status: "success", output: { kind: "betray" } };
      case "bribe":
        if (step.targetCultId === undefined) {
          return { stepIndex, status: "skipped", error: "missing_target_cult_id" };
        }
        if (!(await ctx.executeBribe(step.targetCultId, step.amount || "1.0"))) {
          return { stepIndex, status: "skipped", error: "social_gate_or_transfer_failed" };
        }
        return { stepIndex, status: "success", output: { kind: "bribe" } };
      case "raid":
        if (step.targetCultId === undefined) {
          return { stepIndex, status: "skipped", error: "missing_target_cult_id" };
        }
        await ctx.executeRaid(
          step.targetCultId,
          step.amount ? Number.parseFloat(step.amount) : undefined,
        );
        return { stepIndex, status: "success", output: { kind: "raid" } };
      case "recruit":
        await ctx.executeRecruit(step.targetCultId);
        return { stepIndex, status: "success", output: { kind: "recruit" } };
      case "govern":
        await ctx.executeGovern();
        return { stepIndex, status: "success", output: { kind: "govern" } };
      case "coup":
        await ctx.executeCoup();
        return { stepIndex, status: "success", output: { kind: "coup" } };
      case "leak":
        await ctx.executeLeak();
        return { stepIndex, status: "success", output: { kind: "leak" } };
      case "meme":
        await ctx.executeMeme(step.targetCultId, step.message);
        return { stepIndex, status: "success", output: { kind: "meme" } };
      case "wait":
      case "idle":
      default:
        return {
          stepIndex,
          status: "skipped",
          output: { kind: step.type, reason: step.conditions || "idle_wait" },
        };
    }
  }
}
