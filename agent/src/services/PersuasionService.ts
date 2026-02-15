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
    // NOTE: This is now ONLY for lore/flavor generation.
    // Actual follower counts are determined by recruited agents in the database.
    // NO phantom followers are recorded on-chain.

    log.info(
      `📜 Generated persuasion scripture for ${cultName} targeting ${targetCultName} (lore only)`,
    );

    const event: PersuasionEvent = {
      id: this.nextId++,
      cultId,
      cultName,
      targetCultId,
      targetCultName,
      scripture,
      followersConverted: 0, // No phantom followers - only actual agents count
      recordedOnChain: false, // Never record phantom followers
      timestamp: Date.now(),
    };

    this.events.push(event);
    log.info(
      `${cultName} generated persuasion scripture targeting ${targetCultName} (narrative only)`,
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
