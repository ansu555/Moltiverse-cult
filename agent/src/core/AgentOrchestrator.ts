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
import { RandomnessService } from "../services/RandomnessService.js";
import { GroupGovernanceService } from "../services/GroupGovernanceService.js";
import { PlannerService } from "../services/PlannerService.js";
import { CultAgent, AgentState } from "./CultAgent.js";
import { loadPersonalities, Personality } from "./AgentPersonality.js";
import { createLogger } from "../utils/logger.js";
import {
  loadAllAgents,
  createAgent,
  updateAgentState,
  loadAgentMessages,
  loadRaids,
  loadProphecies,
  loadAllAlliances,
  loadBetrayals,
  loadDefections,
  loadMemes,
  loadTokenTransfers,
  loadSpoilsVotes,
  AgentRow,
  CreateAgentInput,
  updateAgentIdentity,
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
  public randomnessService: RandomnessService;

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
  public groupGovernanceService: GroupGovernanceService;

  constructor() {
    this.nadFunService = new NadFunService();
    this.market = new MarketService();
    this.randomnessService = new RandomnessService(config.simulationSeed);

    // Shared LLM instance for shared services (uses default xAI key)
    const sharedLlm = new LLMService();

    this.prophecyService = new ProphecyService(sharedLlm, this.market);
    this.raidService = new RaidService(this.randomnessService);
    this.lifeDeathService = new LifeDeathService();
    this.memoryService = new MemoryService();
    this.allianceService = new AllianceService(
      this.memoryService,
      this.randomnessService,
    );
    this.defectionService = new DefectionService(
      this.memoryService,
      undefined,
      this.randomnessService,
    );
    this.evolutionService = new EvolutionService();
    this.groupGovernanceService = new GroupGovernanceService(
      this.memoryService,
      this.randomnessService,
    );

    // These will be re-created per-agent, but shared instances for API reads
    this.persuasionService = new PersuasionService(
      sharedLlm,
      new ContractService(),
      this.randomnessService,
    );
    this.governanceService = new GovernanceService(sharedLlm);
    this.communicationService = new CommunicationService(
      sharedLlm,
      this.memoryService,
    );
  }

  async bootstrap(): Promise<void> {
    log.section("Mocult Orchestrator — Bootstrap");
    const bootTimer = log.timer("Full bootstrap");

    // Load existing agents from InsForge DB
    let dbAgents: AgentRow[] = [];
    try {
      dbAgents = await loadAllAgents();
    } catch (err: any) {
      log.errorWithContext("Failed to load agents from InsForge DB", err, {
        baseUrl: (await import("../config.js")).config.insforgeBaseUrl,
      });
      throw new Error(
        `Bootstrap aborted: cannot connect to InsForge — ${err.message}`,
      );
    }

    log.info(`Found ${dbAgents.length} agent(s) in InsForge DB`);
    log.table("Simulation Randomness", {
      seed: config.simulationSeed,
      source: config.simulationSeedSource,
    });

    // Check deployer wallet balance for funding agent wallets
    try {
      const deployerService = new ContractService(); // uses PRIVATE_KEY from .env
      const deployerBalance = await deployerService.getBalance();
      log.table("Deployer Wallet", {
        address: deployerService.address,
        balance: `${ethers.formatEther(deployerBalance)} MON`,
        sufficient:
          Number(deployerBalance) > 0
            ? "✅ yes"
            : "❌ no — agents cannot register on-chain",
      });
    } catch (err: any) {
      log.warn(`Could not check deployer balance: ${err.message}`);
    }

    if (dbAgents.length > 0) {
      // Reconcile cult IDs: DB may have stale cult_ids from a previous contract deployment.
      // Match agents to on-chain cults by name and fix mismatches.
      try {
        const deployer = new ContractService();
        const onChainCults = await deployer.getAllCults();
        const onChainByName = new Map(onChainCults.map((c) => [c.name, c.id]));
        for (const row of dbAgents) {
          if (row.cult_id === null || row.cult_id < 0) continue;
          const expectedId = onChainByName.get(row.name);
          if (expectedId !== undefined && expectedId !== row.cult_id) {
            log.warn(
              `Cult ID mismatch for "${row.name}": DB has ${row.cult_id}, on-chain has ${expectedId} — fixing DB`,
            );
            await updateAgentState(row.id, { cult_id: expectedId });
            row.cult_id = expectedId;
          }
        }
      } catch (err: any) {
        log.warn(`Cult ID reconciliation skipped: ${err.message}`);
      }

      // Hydrate group governance AFTER cult ID reconciliation so memberships use correct IDs
      await this.groupGovernanceService.hydrate(dbAgents);

      // Resume from persisted agents
      log.info("Resuming from persisted agents...");
      for (const row of dbAgents) {
        try {
          await this.bootstrapAgentFromRow(row);
          log.ok(`Agent "${row.name}" bootstrapped (DB id: ${row.id})`);
        } catch (err: any) {
          log.errorWithContext(`Failed to bootstrap agent "${row.name}"`, err, {
            dbId: row.id,
            cultId: row.cult_id,
            wallet: row.wallet_address,
          });
        }
      }
    } else {
      // First run — seed from personalities.json
      log.info("🌱 No agents in DB — seeding from personalities.json...");
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
          log.ok(`Agent "${personality.name}" seeded & bootstrapped`);
        } catch (err: any) {
          log.errorWithContext(
            `Failed to seed agent "${personality.name}"`,
            err,
          );
        }
      }
    }

    // Ensure $CULT token exists
    await this.ensureCultToken();

    log.table("Bootstrap Summary", {
      agentsReady: this.agents.size,
      wallets: `${this.agents.size} unique wallets`,
      cultToken: this.cultTokenAddress || "(none)",
    });

    bootTimer();
  }

  /**
   * Bootstrap a single agent from an InsForge DB row.
   * Creates per-agent LLM, ContractService (with agent's own wallet), and hydrates memory.
   */
  private async bootstrapAgentFromRow(row: AgentRow): Promise<CultAgent> {
    // Per-agent LLM (uses agent's own API key if provided, else falls back to default)
    const llmConfig: LLMConfig | undefined = row.llm_api_key
      ? {
          apiKey: row.llm_api_key,
          baseUrl: row.llm_base_url,
          model: row.llm_model,
        }
      : undefined;
    const agentLlm = new LLMService(llmConfig);
    agentLlm.agentDbId = row.id;
    agentLlm.cultId = row.cult_id ?? -1;

    // Per-agent ContractService (uses agent's own wallet)
    const agentContractService = new ContractService(row.wallet_private_key);

    // Owner ContractService for privileged operations (recordRecruitment, etc.)
    // Uses deployer wallet which is the cult leader on-chain
    const ownerContractService = new ContractService(); // Uses PRIVATE_KEY from env

    log.table(`Agent: ${row.name}`, {
      wallet: row.wallet_address,
      dbId: row.id,
      cultId: row.cult_id ?? "(pending registration)",
      llm: row.llm_model || "default (openrouter/aurora-alpha)",
    });

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
      this.defectionService,
      this.groupGovernanceService,
      this.randomnessService,
      new PlannerService(agentLlm),
      ownerContractService, // Pass owner service for privileged ops
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
      // New agents now start ungrouped. They can create/join/switch groups later.
      const ungroupedSentinel = -row.id;
      agent.cultId = ungroupedSentinel;
      agent.state.cultId = ungroupedSentinel;
      log.info(`"${row.name}" starts ungrouped (agent db id ${row.id})`);
    }

    // Register DB ids in services for persistence
    this.memoryService.registerAgentDbId(agent.cultId, row.id);
    this.evolutionService.registerAgentDbId(agent.cultId, row.id);

    // Hydrate in-memory state from DB (crash recovery)
    const hydrateTimer = log.timer(`Hydrate state for "${personality.name}"`);
    try {
      await Promise.all([
        this.memoryService.hydrate(agent.cultId),
        this.evolutionService.hydrate(agent.cultId, personality),
        this.governanceService.hydrate(agent.cultId),
        this.prophecyService.hydrate(agent.cultId),
      ]);
    } catch (err: any) {
      log.errorWithContext(
        `Partial hydration failure for "${personality.name}"`,
        err,
        {
          cultId: agent.cultId,
        },
      );
    }
    hydrateTimer();

    this.agents.set(agent.cultId, agent);
    this.agentsByDbId.set(row.id, agent);
    this.agentRows.set(row.id, row);

    return agent;
  }

  /**
   * Dynamically create a new agent at runtime (user-created with custom system prompt).
   */
  async createNewAgent(
    input: CreateAgentInput,
  ): Promise<{ agent: CultAgent; row: AgentRow }> {
    log.section(`Creating New Agent: ${input.name}`);
    const timer = log.timer(`Agent creation: ${input.name}`);

    let row: AgentRow;
    try {
      row = await createAgent(input);
    } catch (err: any) {
      log.errorWithContext(`Failed to create agent "${input.name}" in DB`, err);
      throw err;
    }

    const agent = await this.bootstrapAgentFromRow(row);
    timer();
    log.ok(`Agent "${row.name}" created and bootstrapped (DB id: ${row.id})`);

    // Start the agent loop
    agent.start().catch((err) => {
      log.errorWithContext(`Agent "${row.name}" (id: ${row.id}) crashed`, err);
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
          "Mocult",
          "CULT",
          "ipfs://mocult-emergent-religious-economies",
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
    log.section("Starting All Agent Loops");
    const promises: Promise<void>[] = [];

    for (const [id, agent] of this.agents) {
      // Stagger agent starts to avoid RPC spam
      const delay = id * 5000;
      log.info(
        `⏳ Agent ${id} ("${agent.personality.name}") will start in ${
          delay / 1000
        }s`,
      );
      const p = new Promise<void>((resolve) => {
        setTimeout(() => {
          agent.start().catch((err) => {
            log.errorWithContext(
              `Agent ${id} ("${agent.personality.name}") crashed`,
              err,
            );
          });
          resolve();
        }, delay);
      });
      promises.push(p);
    }

    await Promise.all(promises);
    log.ok(`All ${this.agents.size} agents started`);
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

  async applyPersonalitiesFromCanonical(): Promise<{
    applied: number;
    skipped: number;
    totalAgents: number;
    totalPersonalities: number;
    updates: Array<{ agentId: number; name: string; cultId: number | null }>;
  }> {
    const personalities = loadPersonalities(true);
    const rows = this.getAllAgentRows().sort((a, b) => a.id - b.id);
    const updates: Array<{
      agentId: number;
      name: string;
      cultId: number | null;
    }> = [];
    if (personalities.length === 0) {
      throw new Error("No personalities available to apply");
    }

    const byName = new Map(
      personalities.map((personality) => [
        personality.name.trim().toLowerCase(),
        personality,
      ]),
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const matched = byName.get(row.name.trim().toLowerCase());
      const personality = matched || personalities[i % personalities.length];

      await updateAgentIdentity(row.id, {
        name: personality.name,
        symbol: personality.symbol,
        style: personality.style,
        system_prompt: personality.systemPrompt,
        description: personality.description,
      });

      const updatedRow: AgentRow = {
        ...row,
        name: personality.name,
        symbol: personality.symbol,
        style: personality.style,
        system_prompt: personality.systemPrompt,
        description: personality.description,
      };
      this.agentRows.set(row.id, updatedRow);

      const liveAgent = this.agentsByDbId.get(row.id);
      if (liveAgent) {
        liveAgent.personality = { ...personality };
        liveAgent.state.personality = { ...personality };
      }

      updates.push({
        agentId: row.id,
        name: personality.name,
        cultId: row.cult_id,
      });
    }

    return {
      applied: rows.length,
      skipped: Math.max(personalities.length - rows.length, 0),
      totalAgents: rows.length,
      totalPersonalities: personalities.length,
      updates,
    };
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
