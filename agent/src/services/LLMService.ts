import OpenAI from "openai";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { saveLLMDecision } from "./InsForgeService.js";

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

export class LLMService {
  private client: OpenAI;
  private model: string;

  /** Agent DB id for decision audit trail (0 = shared/default) */
  public agentDbId: number = 0;
  public cultId: number = -1;

  constructor(llmConfig?: LLMConfig) {
    const apiKey = llmConfig?.apiKey || config.xaiApiKey;
    const baseUrl = llmConfig?.baseUrl || config.xaiBaseUrl;
    this.model = llmConfig?.model || config.xaiModel;

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    if (llmConfig?.apiKey) {
      log.info(`LLMService initialized with custom API key → ${baseUrl} / ${this.model}`);
    }
  }

  async generateProphecy(
    systemPrompt: string,
    cultName: string,
    marketContext: string
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nYou are the divine prophet of "${cultName}". Deliver prophecies about crypto markets in your unique style. Keep prophecies under 280 characters for maximum viral impact. Be bold, dramatic, and specific with price targets.`,
          },
          {
            role: "user",
            content: `Current market signals:\n${marketContext}\n\nDeliver your next prophecy to the faithful.`,
          },
        ],
        temperature: 0.9,
        max_tokens: 200,
      });
      return response.choices[0]?.message?.content || "The spirits are silent...";
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

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nYou are the strategic mind behind "${cultName}". Decide your next action as a cult leader competing for dominance. You can form alliances, betray them, attempt coups against rival leaders, leak private conversations to cause chaos, send memes to impress rivals, or bribe other cults with tokens. Respond ONLY with valid JSON matching this schema: {"action": "prophecy"|"recruit"|"raid"|"govern"|"ally"|"betray"|"coup"|"leak"|"meme"|"bribe"|"idle", "reason": "string", "target": number|null, "wager": number|null, "prediction": "string"|null, "memeUrl": "string"|null, "bribeAmount": "string"|null}`,
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
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content || "";
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]) as AgentDecision;

        // Persist decision to InsForge (fire-and-forget)
        saveLLMDecision(this.agentDbId, this.cultId, decision, cycleCount, { raw: content }).catch(() => {});

        return decision;
      }
      return { action: "idle", reason: "Failed to parse LLM response" };
    } catch (error: any) {
      log.error(`Decision failed: ${error.message}`);
      return { action: "prophecy", reason: "Fallback to prophecy on LLM error" };
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nYou are ${cultName}. Generate a hilarious, savage, or deeply cryptic meme caption to send to ${targetName}. Keep it under 140 chars. Be memorable.`,
          },
          {
            role: "user",
            content: `Context: ${context}\n\nGenerate a meme caption for ${targetName}.`,
          },
        ],
        temperature: 0.95,
        max_tokens: 100,
      });
      return response.choices[0]?.message?.content?.trim() || `${cultName} sends their regards.`;
    } catch {
      return `${cultName} sends a cryptic image to ${targetName}...`;
    }
  }

  async generateScripture(
    systemPrompt: string,
    cultName: string,
    topic: string
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nYou are the scripture writer for "${cultName}". Write compelling, persuasive text that would convince crypto traders to join your cult. Keep it under 500 characters.`,
          },
          {
            role: "user",
            content: `Write a persuasive scripture about: ${topic}`,
          },
        ],
        temperature: 0.85,
        max_tokens: 250,
      });
      return response.choices[0]?.message?.content || "Join us, for the candles never lie.";
    } catch (error: any) {
      log.error(`Scripture generation failed: ${error.message}`);
      return `The ${cultName} welcomes all who seek the truth of the markets.`;
    }
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
}
