import { ethers } from "ethers";
import { config } from "../config.js";
import { ContractService } from "../chain/ContractService.js";
import { NadFunService } from "../chain/NadFunService.js";
import { TransactionQueue } from "../chain/TransactionQueue.js";
import { LLMService, LLMConfig } from "../services/LLMService.js";
import { ProphecyService } from "../services/ProphecyService.js";
import { RaidService } from "../services/RaidService.js";
import { PersuasionService } from "../services/PersuasionService.js";
import { LifeDeathService } from "../services/LifeDeathService.js";
import { GovernanceService } from "../services/GovernanceService.js";
import { MemoryService } from "../services/MemoryService.js";
import { AllianceService } from "../services/AllianceService.js";
import { DefectionService } from "../services/DefectionService.js";
import { CommunicationService } from "../services/CommunicationService.js";
import { EvolutionService } from "../services/EvolutionService.js";
import { MarketService } from "../services/MarketService.js";
import { CultAgent, AgentState } from "./CultAgent.js";
import { loadPersonalities, Personality } from "./AgentPersonality.js";
import { createLogger } from "../utils/logger.js";
import {
  loadAllAgents, createAgent, updateAgentState, loadAgentMessages,
  loadRaids, loadProphecies, loadAllAlliances, loadBetrayals,
  loadDefections, loadMemes, loadTokenTransfers, loadSpoilsVotes,
  AgentRow, CreateAgentInput,
} from "../services/InsForgeService.js";

const log = createLogger("Orchestrator");

export class AgentOrchestrator {
  private agents: Map<number, CultAgent> = new Map();
  /** Map agent DB id → CultAgent for quick lookup */
  private agentsByDbId: Map<number, CultAgent> = new Map();
  /** Store agent DB rows for API access */
  public agentRows: Map<number, AgentRow> = new Map();

  private nadFunService: NadFunService;
  private market: MarketService;

  // Token created on nad.fun
  public cultTokenAddress: string = "";

  // Shared services (agents share state for the API to read)
  public prophecyService: ProphecyService;
  public raidService: RaidService;
  public persuasionService: PersuasionService;
  public lifeDeathService: LifeDeathService;
  public governanceService: GovernanceService;
  public memoryService: MemoryService;
  public allianceService: AllianceService;
  public defectionService: DefectionService;
  public communicationService: CommunicationService;
  public evolutionService: EvolutionService;

  constructor() {
    this.nadFunService = new NadFunService();
    this.market = new MarketService();

    // Shared LLM instance for shared services (uses default xAI key)
    const sharedLlm = new LLMService();

    this.prophecyService = new ProphecyService(sharedLlm, this.market);
    this.raidService = new RaidService();
    this.lifeDeathService = new LifeDeathService();
    this.memoryService = new MemoryService();
    this.allianceService = new AllianceService(this.memoryService);
    this.defectionService = new DefectionService(this.memoryService);
    this.evolutionService = new EvolutionService();

    // These will be re-created per-agent, but shared instances for API reads
    this.persuasionService = new PersuasionService(sharedLlm, new ContractService());
    this.governanceService = new GovernanceService(sharedLlm);
    this.communicationService = new CommunicationService(sharedLlm, this.memoryService);
  }

  async bootstrap(): Promise<void> {
    log.info("Bootstrapping AgentCult orchestrator with InsForge persistence...");

    // Load existing agents from InsForge DB
    const dbAgents = await loadAllAgents();
    log.info(`Found ${dbAgents.length} agents in InsForge DB`);

    if (dbAgents.length > 0) {
      // Resume from persisted agents
      for (const row of dbAgents) {
        await this.bootstrapAgentFromRow(row);
      }
    } else {
      // First run — seed from personalities.json
      log.info("No agents in DB — seeding from personalities.json...");
      const personalities = loadPersonalities();
      for (const personality of personalities) {
        try {
          const row = await createAgent({
            name: personality.name,
            symbol: personality.symbol,
            style: personality.style,
            system_prompt: personality.systemPrompt,
            description: personality.description,
          });
          await this.bootstrapAgentFromRow(row);
        } catch (err: any) {
          log.error(`Failed to seed agent ${personality.name}: ${err.message}`);
        }
      }
    }

    // Ensure $CULT token exists
    await this.ensureCultToken();

    log.info(`${this.agents.size} agents ready (each with its own wallet)`);
  }

  /**
   * Bootstrap a single agent from an InsForge DB row.
   * Creates per-agent LLM, ContractService (with agent's own wallet), and hydrates memory.
   */
  private async bootstrapAgentFromRow(row: AgentRow): Promise<CultAgent> {
    // Per-agent LLM (uses agent's own API key if provided, else falls back to default)
    const llmConfig: LLMConfig | undefined = row.llm_api_key
      ? { apiKey: row.llm_api_key, baseUrl: row.llm_base_url, model: row.llm_model }
      : undefined;
    const agentLlm = new LLMService(llmConfig);
    agentLlm.agentDbId = row.id;
    agentLlm.cultId = row.cult_id ?? -1;

    // Per-agent ContractService (uses agent's own wallet)
    const agentContractService = new ContractService(row.wallet_private_key);

    log.info(`Agent ${row.name} → wallet ${row.wallet_address} (DB id: ${row.id})`);

    const personality: Personality = {
      name: row.name,
      symbol: row.symbol,
      style: row.style,
      systemPrompt: row.system_prompt,
      description: row.description,
    };

    const agent = new CultAgent(
      personality,
      agentContractService,
      agentLlm,
      this.prophecyService,
      this.raidService,
      this.persuasionService,
      this.lifeDeathService,
      this.governanceService,
      this.memoryService,
      this.allianceService,
      this.communicationService,
      this.evolutionService,
      this.market,
    );

    // Set the agent's DB id so it can persist state
    agent.agentDbId = row.id;

    // If cult was already registered on-chain, restore that
    if (row.cult_id !== null && row.cult_id >= 0) {
      agent.cultId = row.cult_id;
      agent.state.cultId = row.cult_id;
      agent.state.cycleCount = row.cycle_count;
      agent.state.propheciesGenerated = row.prophecies_generated;
      agent.state.raidsInitiated = row.raids_initiated;
      agent.state.raidsWon = row.raids_won;
      agent.state.followersRecruited = row.followers_recruited;
      agent.state.lastAction = row.last_action;
      agent.state.lastActionTime = row.last_action_time;
      agent.state.dead = row.dead;
      agent.state.deathCause = row.death_cause;
    } else {
      // Register on-chain
      try {
        await agent.initialize(this.cultTokenAddress || ethers.ZeroAddress);
        // Persist the cult_id back to DB
        await updateAgentState(row.id, { cult_id: agent.cultId });
      } catch (err: any) {
        log.error(`Failed to register ${row.name} on-chain: ${err.message}`);
        agent.cultId = row.id; // Use DB id as fallback
        agent.state.cultId = row.id;
      }
    }

    // Register DB ids in services for persistence
    this.memoryService.registerAgentDbId(agent.cultId, row.id);
    this.evolutionService.registerAgentDbId(agent.cultId, row.id);

    // Hydrate in-memory state from DB (crash recovery)
    await Promise.all([
      this.memoryService.hydrate(agent.cultId),
      this.evolutionService.hydrate(agent.cultId, personality),
      this.governanceService.hydrate(agent.cultId),
      this.prophecyService.hydrate(agent.cultId),
    ]);

    this.agents.set(agent.cultId, agent);
    this.agentsByDbId.set(row.id, agent);
    this.agentRows.set(row.id, row);

    return agent;
  }

  /**
   * Dynamically create a new agent at runtime (user-created with custom system prompt).
   */
  async createNewAgent(input: CreateAgentInput): Promise<{ agent: CultAgent; row: AgentRow }> {
    log.info(`Creating new user agent: ${input.name}`);
    const row = await createAgent(input);
    const agent = await this.bootstrapAgentFromRow(row);

    // Start the agent loop
    agent.start().catch((err) => {
      log.error(`Agent ${row.id} crashed: ${err.message}`);
    });

    return { agent, row };

  }

  private async ensureCultToken(): Promise<void> {
    // If token address already configured in env, use it
    if (
      config.cultTokenAddress &&
      config.cultTokenAddress !== ethers.ZeroAddress
    ) {
      this.cultTokenAddress = config.cultTokenAddress;
      log.info(`Using configured $CULT token: ${this.cultTokenAddress}`);
      return;
    }

    // Create a new $CULT token on nad.fun (use first agent's wallet for creation)
    const firstAgent = this.agents.values().next().value;
    if (!firstAgent) return;

    log.info("No $CULT token configured, creating on nad.fun...");
    try {
      const { tokenAddress, poolAddress } =
        await this.nadFunService.createToken(
          "AgentCult",
          "CULT",
          "ipfs://agentcult-emergent-religious-economies",
          ethers.parseEther("0.01"),
        );

      if (tokenAddress) {
        this.cultTokenAddress = tokenAddress;
        log.info(`$CULT token created at: ${tokenAddress}`);
        log.info(`Pool address: ${poolAddress}`);
        log.info(`Set CULT_TOKEN_ADDRESS=${tokenAddress} in your .env file`);
      }
    } catch (error: any) {
      log.warn(
        `Token creation failed: ${error.message}. Agents will run without token.`,
      );
    }
  }

  async startAll(): Promise<void> {
    log.info("Starting all agent loops...");
    const promises: Promise<void>[] = [];

    for (const [id, agent] of this.agents) {
      // Stagger agent starts to avoid RPC spam
      const delay = id * 5000;
      const p = new Promise<void>((resolve) => {
        setTimeout(() => {
          agent.start().catch((err) => {
            log.error(`Agent ${id} crashed: ${err.message}`);
          });
          resolve();
        }, delay);
      });
      promises.push(p);
    }

    await Promise.all(promises);
    log.info("All agents started");
  }

  stopAll(): void {
    for (const agent of this.agents.values()) {
      agent.stop();
    }
    log.info("All agents stopped");
  }

  getAgentStates(): AgentState[] {
    return Array.from(this.agents.values()).map((a) => a.state);
  }

  getAgent(cultId: number): CultAgent | undefined {
    return this.agents.get(cultId);
  }

  getAgentByDbId(dbId: number): CultAgent | undefined {
    return this.agentsByDbId.get(dbId);
  }

  getAgentRow(dbId: number): AgentRow | undefined {
    return this.agentRows.get(dbId);
  }

  getAllAgentRows(): AgentRow[] {
    return Array.from(this.agentRows.values());
  }

  async getCultsFromChain() {
    // Use first agent's contract service for reading
    const firstAgent = this.agents.values().next().value;
    if (!firstAgent) return [];
    // Access contract service via a shared read-only one
    const readService = new ContractService();
    return readService.getAllCults();
  }

  async getStats() {
    const readService = new ContractService();
    const totalCults = await readService.getTotalCults().catch(() => 0);
    const totalRaids = await readService.getTotalRaids().catch(() => 0);
    return {
      totalCults,
      totalRaids,
      totalProphecies: this.prophecyService.getAllProphecies().length,
      activeAgents: Array.from(this.agents.values()).filter(
        (a) => a.state.running,
      ).length,
      totalAgentsInDb: this.agentRows.size,
    };
  }
}
