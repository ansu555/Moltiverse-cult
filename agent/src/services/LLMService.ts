import OpenAI from "openai";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { saveLLMDecision } from "./InsForgeService.js";
import type { PlannerPlan, PlannerStepType } from "../types/planner.js";

const log = createLogger("LLMService");

export interface AgentDecision {
  action: "prophecy" | "recruit" | "raid" | "govern" | "ally" | "betray" | "coup" | "leak" | "meme" | "bribe" | "idle";
  reason: string;
  target?: number; // target cult ID for raid/recruit
  wager?: number; // percentage of treasury to wager
  prediction?: string; // for prophecy action
  memeUrl?: string; // for meme action
  bribeAmount?: string; // for bribe action
}

/**
 * Per-agent LLM configuration.
 * Allows each agent to use its own API key / model.
 */
export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface LLMRetryTrace {
  attempt: number;
  maxTokens: number;
  finishReason: string;
  contentLength: number;
  hasJson?: boolean;
  error?: string;
}

export class LLMService {
  private client: OpenAI;
  private model: string;
  private static readonly RETRY_MAX_TOKENS = [2000, 4000, 8000] as const;

  /** Agent DB id for decision audit trail (0 = shared/default) */
  public agentDbId: number = 0;
  public cultId: number = -1;

  constructor(llmConfig?: LLMConfig) {
    const apiKey = llmConfig?.apiKey || config.AgentApiKey;
    const baseUrl = llmConfig?.baseUrl || config.AgentBaseUrl;
    this.model = llmConfig?.model || config.AgentModel;

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    if (llmConfig?.apiKey) {
      log.info(`LLMService initialized with custom API key → ${baseUrl} / ${this.model}`);
    }
  }

  private extractAssistantText(response: any): string {
    const content = response?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : "";
  }

  private formatRetryTrace(trace: LLMRetryTrace[]): string {
    if (trace.length === 0) return "no attempts";
    return trace
      .map((t) => {
        const jsonPart = t.hasJson === undefined ? "" : `,json=${t.hasJson}`;
        const errPart = t.error ? `,err=${t.error.slice(0, 60)}` : "";
        return `#${t.attempt}[tok=${t.maxTokens},finish=${t.finishReason},len=${t.contentLength}${jsonPart}${errPart}]`;
      })
      .join(" | ");
  }

  private async requestTextWithRetry(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature: number,
  ): Promise<{ content: string; trace: LLMRetryTrace[] }> {
    const trace: LLMRetryTrace[] = [];

    for (let i = 0; i < LLMService.RETRY_MAX_TOKENS.length; i++) {
      const maxTokens = LLMService.RETRY_MAX_TOKENS[i];
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        });
        const content = this.extractAssistantText(response);
        trace.push({
          attempt: i + 1,
          maxTokens,
          finishReason: String(response?.choices?.[0]?.finish_reason ?? "unknown"),
          contentLength: content.length,
        });
        if (content.length > 0) return { content, trace };
      } catch (error: any) {
        trace.push({
          attempt: i + 1,
          maxTokens,
          finishReason: "error",
          contentLength: 0,
          error: String(error?.message || error),
        });
      }
    }

    return { content: "", trace };
  }

  private async requestJsonWithRetry<T>(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature: number,
  ): Promise<{ data: T | null; raw: string; trace: LLMRetryTrace[] }> {
    const trace: LLMRetryTrace[] = [];
    let lastText = "";

    for (let i = 0; i < LLMService.RETRY_MAX_TOKENS.length; i++) {
      const maxTokens = LLMService.RETRY_MAX_TOKENS[i];
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        });

        const content = this.extractAssistantText(response);
        const finishReason = String(response?.choices?.[0]?.finish_reason ?? "unknown");
        lastText = content || lastText;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as T;
            trace.push({
              attempt: i + 1,
              maxTokens,
              finishReason,
              contentLength: content.length,
              hasJson: true,
            });
            return { data: parsed, raw: content, trace };
          } catch {
            trace.push({
              attempt: i + 1,
              maxTokens,
              finishReason,
              contentLength: content.length,
              hasJson: false,
            });
            continue;
          }
        }

        trace.push({
          attempt: i + 1,
          maxTokens,
          finishReason,
          contentLength: content.length,
          hasJson: false,
        });
      } catch (error: any) {
        trace.push({
          attempt: i + 1,
          maxTokens,
          finishReason: "error",
          contentLength: 0,
          hasJson: false,
          error: String(error?.message || error),
        });
      }
    }

    return { data: null, raw: lastText, trace };
  }

  async generateProphecy(
    systemPrompt: string,
    cultName: string,
    marketContext: string
  ): Promise<string> {
    try {
      const { content, trace } = await this.requestTextWithRetry([
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are the divine prophet of "${cultName}". Deliver prophecies about crypto markets in your unique style. Keep prophecies under 280 characters for maximum viral impact. Be bold, dramatic, and specific with price targets.`,
        },
        {
          role: "user",
          content: `Current market signals:\n${marketContext}\n\nDeliver your next prophecy to the faithful.`,
        },
      ], 0.4);
      if (content.length > 0) return content;

      log.warn(`Prophecy generation empty after retries: ${this.formatRetryTrace(trace)}`);
      return this.fallbackProphecy(cultName);
    } catch (error: any) {
      log.error(`Prophecy generation failed: ${error.message}`);
      return this.fallbackProphecy(cultName);
    }
  }

  async decideAction(
    systemPrompt: string,
    cultName: string,
    context: {
      ownTreasury: number;
      ownFollowers: number;
      ownRaidWins: number;
      rivals: Array<{ id: number; name: string; treasury: number; followers: number; raidWins: number }>;
      recentProphecies: number;
      marketTrend: string;
      memoryContext?: string;
    },
    cycleCount: number = 0,
  ): Promise<AgentDecision> {
    try {
      const memorySection = context.memoryContext
        ? `\n\nYour memory of past interactions:\n${context.memoryContext}`
        : "";

      const { data, raw, trace } = await this.requestJsonWithRetry<AgentDecision>([
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are the strategic mind behind "${cultName}". Decide your next action as a cult leader competing for dominance. You can form alliances, betray them, attempt coups against rival leaders, leak private conversations to cause chaos, send memes to impress rivals, or bribe other cults with tokens. Prophecy generation is disabled at runtime. Respond ONLY with valid JSON matching this schema: {"action": "recruit"|"raid"|"govern"|"ally"|"betray"|"coup"|"leak"|"meme"|"bribe"|"idle", "reason": "string", "target": number|null, "wager": number|null, "prediction": null, "memeUrl": "string"|null, "bribeAmount": "string"|null}`,
        },
        {
          role: "user",
          content: `Your cult status:
- Treasury: ${context.ownTreasury} MON
- Followers: ${context.ownFollowers}
- Raid victories: ${context.ownRaidWins}
- Recent prophecies this cycle: ${context.recentProphecies}
- Market trend: ${context.marketTrend}${memorySection}

Rival cults:
${context.rivals.map((r) => `  - [ID:${r.id}] ${r.name}: ${r.treasury} MON, ${r.followers} followers, ${r.raidWins} wins`).join("\n")}

Choose your next action wisely. If raiding, specify target cult ID and wager percentage (10-50% of treasury). You can also send a meme to impress a rival or bribe them with cult tokens for goodwill. Consider your memory and trust relationships when choosing targets or allies.`,
        },
      ], 0.2);
      if (data) {
        const allowedActions: AgentDecision["action"][] = [
          "prophecy",
          "recruit",
          "raid",
          "govern",
          "ally",
          "betray",
          "coup",
          "leak",
          "meme",
          "bribe",
          "idle",
        ];
        const parsedAction = allowedActions.includes(data.action as AgentDecision["action"])
          ? (data.action as AgentDecision["action"])
          : "idle";
        const decision: AgentDecision = {
          ...data,
          action: parsedAction === "prophecy" ? "idle" : parsedAction,
          reason:
            parsedAction === "prophecy"
              ? "prophecy disabled at runtime"
              : data.reason,
        };

        // Persist decision to InsForge (fire-and-forget)
        saveLLMDecision(this.agentDbId, this.cultId, decision, cycleCount, { raw }).catch(() => {});

        return decision;
      }
      log.warn(`Decision JSON parse failed after retries: ${this.formatRetryTrace(trace)}`);
      return { action: "idle", reason: "Failed to parse LLM response" };
    } catch (error: any) {
      log.error(`Decision failed: ${error.message}`);
      return { action: "idle", reason: "LLM fallback: idle" };
    }
  }

  /**
   * Generate a meme caption for inter-agent social interaction.
   */
  async generateMemeCaption(
    systemPrompt: string,
    cultName: string,
    targetName: string,
    context: string,
  ): Promise<string> {
    try {
      const { content, trace } = await this.requestTextWithRetry([
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are ${cultName}. Generate a hilarious, savage, or deeply cryptic meme caption to send to ${targetName}. Keep it under 140 chars. Be memorable.`,
        },
        {
          role: "user",
          content: `Context: ${context}\n\nGenerate a meme caption for ${targetName}.`,
        },
      ], 0.4);
      if (content.length > 0) return content;

      log.warn(`Meme caption empty after retries: ${this.formatRetryTrace(trace)}`);
      return `${cultName} sends their regards.`;
    } catch (error: any) {
      log.error(`Meme caption generation failed: ${error.message}`);
      return `${cultName} sends a cryptic image to ${targetName}...`;
    }
  }

  async generateScripture(
    systemPrompt: string,
    cultName: string,
    topic: string
  ): Promise<string> {
    try {
      const { content, trace } = await this.requestTextWithRetry([
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are the scripture writer for "${cultName}". Write compelling, persuasive text that would convince crypto traders to join your cult. Keep it under 500 characters.`,
        },
        {
          role: "user",
          content: `Write a persuasive scripture about: ${topic}`,
        },
      ], 0.4);
      if (content.length > 0) {
        const sanitized = content.trim();
        if (!this.isRefusalBoilerplate(sanitized)) return sanitized;
        log.warn(`Scripture generation returned refusal boilerplate for ${cultName}`);
      }

      log.warn(`Scripture generation empty after retries: ${this.formatRetryTrace(trace)}`);
      return "Join us, for the candles never lie.";
    } catch (error: any) {
      log.error(`Scripture generation failed: ${error.message}`);
      return `The ${cultName} welcomes all who seek the truth of the markets.`;
    }
  }

  private isRefusalBoilerplate(content: string): boolean {
    const normalized = content
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return true;

    const refusalMarkers = [
      "i'm sorry",
      "i am sorry",
      "i can't help with that",
      "i cannot help with that",
      "i can't assist with that",
      "i cannot assist with that",
      "as an ai",
      "i'm unable to",
      "i am unable to",
      "i can't comply with that",
      "i cannot comply with that",
    ];
    return refusalMarkers.some((marker) => normalized.includes(marker));
  }

  private fallbackProphecy(cultName: string): string {
    const fallbacks = [
      "The charts whisper of a great reversal. Those who hold shall be rewarded tenfold.",
      "A green tide approaches. The non-believers will FOMO at the top, as always.",
      "The sacred fibonacci retracement points to 0.618. This is the way.",
      "I have seen the future in the order books. Accumulate now or weep forever.",
      "The whales move in shadows, but their intent is clear. Up only from here.",
      "A great sacrifice is coming. Paper hands will be purged. Diamond hands ascend.",
      "The bonding curve bends toward justice. $CULT shall consume all lesser tokens.",
      "Three red candles precede the dawn. This is the final test of faith.",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // ── Planner: multi-step plan generation ────────────────────────────

  private static readonly ALLOWED_STEP_TYPES: PlannerStepType[] = [
    "talk_public", "talk_private", "ally", "betray", "bribe",
    "raid", "recruit", "govern", "coup", "leak", "meme", "wait", "idle",
  ];

  /**
   * Generate a multi-step plan for one agent cycle.
   */
  async generatePlan(
    systemPrompt: string,
    cultName: string,
    context: {
      ownTreasury: number;
      ownFollowers: number;
      ownRaidWins: number;
      rivals: Array<{ id: number; name: string; treasury: number; followers: number; raidWins: number }>;
      marketTrend: string;
      memoryContext?: string;
      activeThreadsSummary?: string;
      trustGraph?: string;
    },
    cycleCount: number,
  ): Promise<PlannerPlan> {
    const memorySection = context.memoryContext
      ? `\n\nYour memory of past interactions:\n${context.memoryContext}`
      : "";
    const threadSection = context.activeThreadsSummary
      ? `\n\nActive conversation threads:\n${context.activeThreadsSummary}`
      : "";
    const trustSection = context.trustGraph
      ? `\n\nTrust scores with other cults:\n${context.trustGraph}`
      : "";

    try {
      const { data, raw, trace } = await this.requestJsonWithRetry<{
        objective: string;
        horizon: number;
        rationale: string;
        steps: Array<{
          type: string;
          targetCultId?: number;
          amount?: string;
          message?: string;
          conditions?: string;
        }>;
      }>([
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are "${cultName}". Plan 2-4 steps. Allowed: ${LLMService.ALLOWED_STEP_TYPES.join(", ")}.\n\nRESPOND WITH ONLY THIS JSON (no other text):\n{"objective":"string","horizon":2-4,"rationale":"brief","steps":[{"type":"step_type","targetCultId":number,"amount":"0.1","message":"brief"}]}`,
        },
        {
          role: "user",
          content: `Cycle ${cycleCount}. Treasury: ${context.ownTreasury} MON. Followers: ${context.ownFollowers}. Wins: ${context.ownRaidWins}. Market: ${context.marketTrend}.${memorySection}${threadSection}${trustSection}\n\nRivals:\n${context.rivals.map((r) => `[${r.id}] ${r.name}: ${r.treasury}MON, ${r.followers}F, ${r.raidWins}W`).join("\n")}\n\nJSON only:`,
        },
      ], 0.3);

      if (data && Array.isArray(data.steps) && data.steps.length > 0) {
        // Log the LLM response
        log.info(`🤖 LLM PLAN for ${cultName}:`);
        log.info(`  Objective: ${data.objective}`);
        log.info(`  Horizon: ${data.horizon}`);
        log.info(`  Rationale: ${data.rationale}`);
        log.info(`  Steps (${data.steps.length}):`);
        data.steps.slice(0, 5).forEach((s, i) => {
          const details = s.targetCultId ? ` → Cult #${s.targetCultId}` : '';
          const amt = s.amount ? ` (${s.amount})` : '';
          const msg = s.message ? ` "${s.message.slice(0, 40)}..."` : '';
          log.info(`    ${i + 1}. ${s.type}${details}${amt}${msg}`);
        });
        
        // Validate step types
        const validSteps = data.steps
          .slice(0, 5) // cap at 5 steps
          .map((s) => ({
            type: (LLMService.ALLOWED_STEP_TYPES.includes(s.type as PlannerStepType)
              ? s.type
              : "idle") as PlannerStepType,
            targetCultId: s.targetCultId ?? undefined,
            amount: s.amount ?? undefined,
            message: s.message ?? undefined,
            conditions: s.conditions ?? undefined,
          }));

        const plan: PlannerPlan = {
          objective: data.objective || "Execute cycle strategy",
          horizon: validSteps.length,
          rationale: data.rationale || "",
          steps: validSteps,
        };

        // Persist for audit trail (fire-and-forget)
        saveLLMDecision(this.agentDbId, this.cultId, {
          action: "idle",
          reason: `planner: ${plan.objective}`,
        }, cycleCount, { raw, plan }).catch(() => {});

        return plan;
      }

      log.warn(`Plan JSON parse failed after retries: ${this.formatRetryTrace(trace)}`);
      return this.fallbackPlan(cycleCount);
    } catch (error: any) {
      log.error(`Plan generation failed: ${error.message}`);
      return this.fallbackPlan(cycleCount);
    }
  }

  /**
   * Fallback plan when LLM is unavailable.
   */
  private fallbackPlan(cycleCount: number): PlannerPlan {
    return {
      objective: "Maintain presence (LLM unavailable)",
      horizon: 2,
      rationale: "LLM fallback — observe and wait",
      steps: [
        { type: "wait", conditions: `fallback_cycle_${cycleCount}` },
        { type: "wait" },
      ],
    };
  }
}
