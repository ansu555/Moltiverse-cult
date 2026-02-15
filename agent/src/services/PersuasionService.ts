import { LLMService } from "./LLMService.js";
import { ContractService } from "../chain/ContractService.js";
import { createLogger } from "../utils/logger.js";
import { RandomnessService } from "./RandomnessService.js";

const log = createLogger("PersuasionService");

export interface PersuasionEvent {
  id: number;
  cultId: number;
  cultName: string;
  targetCultId: number;
  targetCultName: string;
  scripture: string;
  followersConverted: number;
  recordedOnChain: boolean;
  timestamp: number;
}

export class PersuasionService {
  private llm: LLMService;
  private contractService: ContractService;
  private randomness: RandomnessService;
  private events: PersuasionEvent[] = [];
  private nextId = 0;

  constructor(
    llm: LLMService,
    contractService: ContractService,
    randomness?: RandomnessService,
  ) {
    this.llm = llm;
    this.contractService = contractService;
    this.randomness = randomness || new RandomnessService();
  }

  async attemptConversion(
    cultId: number,
    cultName: string,
    systemPrompt: string,
    targetCultId: number,
    targetCultName: string,
    cultTreasury: number = 1000,
    cultMembers: number = 5,
    targetMembers: number = 5,
  ): Promise<PersuasionEvent> {
    const scripture = await this.llm.generateScripture(
      systemPrompt,
      cultName,
      `Why followers of "${targetCultName}" should abandon their false prophets and join the true faith of "${cultName}"`,
    );

    // ── Design Doc §6.2: Persuasion Formula ─────────────────────
    // Conversions = floor(scriptureQuality × cultPower × charismaFactor / resistance)
    //
    // scriptureQuality: 0.3-1.0 (LLM quality approximated by length/detail)
    const scriptureQuality = Math.min(1.0, 0.3 + (scripture.length / 500) * 0.7);

    // cultPower: normalized cult strength (treasury + members)
    const cultPower = Math.min(1.0, (cultTreasury * 0.6 + cultMembers * 100 * 0.4) / 10000);

    // charismaFactor: small random variance ±20%
    const charismaFactor =
      0.8 +
      this.randomness.float({
        domain: "persuasion_charisma",
        cycle: this.nextId,
        cultId,
        agentId: targetCultId,
      }) *
        0.4;

    // resistance: larger cults are harder to poach from
    const resistance = Math.max(1.0, targetMembers / 5);

    // Final calculation
    const rawConversions = scriptureQuality * cultPower * charismaFactor * 5 / resistance;
    const followersConverted = Math.max(1, Math.min(5, Math.floor(rawConversions)));

    log.info(
      `📜 Persuasion formula: quality=${scriptureQuality.toFixed(2)} power=${cultPower.toFixed(2)} ` +
      `charisma=${charismaFactor.toFixed(2)} resistance=${resistance.toFixed(2)} → ${followersConverted} converts`,
    );

    // Record follower joins on-chain
    let recordedOnChain = false;
    try {
      await this.contractService.recordRecruitment(cultId, followersConverted);
      recordedOnChain = true;
      log.info(
        `Recorded ${followersConverted} recruited followers on-chain for cult ${cultId}`,
      );
    } catch (error: any) {
      log.warn(`Failed to record followers on-chain: ${error.message}`);
    }

    const event: PersuasionEvent = {
      id: this.nextId++,
      cultId,
      cultName,
      targetCultId,
      targetCultName,
      scripture,
      followersConverted,
      recordedOnChain,
      timestamp: Date.now(),
    };

    this.events.push(event);
    log.info(
      `${cultName} converted ${followersConverted} followers from ${targetCultName}${
        recordedOnChain ? " (on-chain)" : " (off-chain)"
      }`,
    );

    return event;
  }

  getRecentEvents(limit: number = 20): PersuasionEvent[] {
    return this.events.slice(-limit).reverse();
  }

  getAllEvents(): PersuasionEvent[] {
    return [...this.events].reverse();
  }
}
