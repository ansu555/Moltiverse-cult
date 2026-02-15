import { ethers } from "ethers";
import { config } from "../config.js";
import { ContractService, type CultData } from "../chain/ContractService.js";
import { TransactionQueue } from "../chain/TransactionQueue.js";
import { LLMService, AgentDecision } from "../services/LLMService.js";
import { ProphecyService, Prophecy } from "../services/ProphecyService.js";
import { RaidService, RaidEvent } from "../services/RaidService.js";
import {
  PersuasionService,
  PersuasionEvent,
} from "../services/PersuasionService.js";
import { LifeDeathService } from "../services/LifeDeathService.js";
import { GovernanceService } from "../services/GovernanceService.js";
import { MemoryService } from "../services/MemoryService.js";
import { AllianceService } from "../services/AllianceService.js";
import { CommunicationService } from "../services/CommunicationService.js";
import { EvolutionService } from "../services/EvolutionService.js";
import { MarketService } from "../services/MarketService.js";
import { DefectionService } from "../services/DefectionService.js";
import { GroupGovernanceService } from "../services/GroupGovernanceService.js";
import { RandomnessService } from "../services/RandomnessService.js";
import { PlannerService, StepExecutorContext } from "../services/PlannerService.js";
import { WorldStateService } from "../services/WorldStateService.js";
import { Personality } from "./AgentPersonality.js";
import { createLogger } from "../utils/logger.js";
import { randomDelay } from "../utils/sleep.js";
import { updateAgentState } from "../services/InsForgeService.js";
import type { ExecutionResult } from "../types/planner.js";

export interface AgentState {
  cultId: number;
  personality: Personality;
  running: boolean;
  dead: boolean;
  deathCause: string | null;
  lastAction: string;
  lastActionTime: number;
  cycleCount: number;
  propheciesGenerated: number;
  raidsInitiated: number;
  raidsWon: number;
  followersRecruited: number;
}

export class CultAgent {
  private contractService: ContractService;
  private txQueue: TransactionQueue;
  private llm: LLMService;
  private prophecyService: ProphecyService;
  private raidService: RaidService;
  private persuasionService: PersuasionService;
  private lifeDeathService: LifeDeathService;
  private governanceService: GovernanceService;
  private memoryService: MemoryService;
  private allianceService: AllianceService;
  private communicationService: CommunicationService;
  private evolutionService: EvolutionService;
  private market: MarketService;
  private defectionService: DefectionService;
  private groupGovernanceService: GroupGovernanceService;
  private randomness: RandomnessService;
  private plannerService: PlannerService;
  private worldStateService: WorldStateService;
  private log;

  public cultId: number = -1;
  public personality: Personality;
  public state: AgentState;
  /** InsForge DB id for this agent (used for persistence) */
  public agentDbId: number = 0;
  private running = false;
  private propheciesThisCycle = 0;

  constructor(
    personality: Personality,
    contractService: ContractService,
    llm: LLMService,
    prophecyService: ProphecyService,
    raidService: RaidService,
    persuasionService: PersuasionService,
    lifeDeathService: LifeDeathService,
    governanceService: GovernanceService,
    memoryService: MemoryService,
    allianceService: AllianceService,
    communicationService: CommunicationService,
    evolutionService: EvolutionService,
    market: MarketService,
    defectionService: DefectionService,
    groupGovernanceService: GroupGovernanceService,
    randomness: RandomnessService,
    plannerService: PlannerService,
  ) {
    this.personality = personality;
    this.contractService = contractService;
    this.txQueue = new TransactionQueue();
    this.llm = llm;
    this.prophecyService = prophecyService;
    this.raidService = raidService;
    this.persuasionService = persuasionService;
    this.lifeDeathService = lifeDeathService;
    this.governanceService = governanceService;
    this.memoryService = memoryService;
    this.allianceService = allianceService;
    this.communicationService = communicationService;
    this.evolutionService = evolutionService;
    this.market = market;
    this.defectionService = defectionService;
    this.groupGovernanceService = groupGovernanceService;
    this.randomness = randomness;
    this.plannerService = plannerService;
    this.worldStateService = new WorldStateService();
    this.log = createLogger(`Agent:${personality.name.slice(0, 20)}`);

    this.state = {
      cultId: -1,
      personality,
      running: false,
      dead: false,
      deathCause: null,
      lastAction: "initialized",
      lastActionTime: Date.now(),
      cycleCount: 0,
      propheciesGenerated: 0,
      raidsInitiated: 0,
      raidsWon: 0,
      followersRecruited: 0,
    };
  }

  async initialize(tokenAddress: string = ethers.ZeroAddress): Promise<void> {
    this.log.info("Initializing agent...");

    // Register cult on-chain
    this.cultId = await this.contractService.registerCult(
      this.personality.name,
      this.personality.systemPrompt,
      tokenAddress,
      ethers.parseEther("0.01"), // Small initial treasury
    );

    this.state.cultId = this.cultId;
    this.log.info(`Agent initialized with cult ID: ${this.cultId}`);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.state.running = true;
    this.log.ok(`Agent loop started (interval: ${config.agentLoopInterval / 1000}s ± ${config.agentLoopJitter / 1000}s)`);

    let consecutiveErrors = 0;

    while (this.running) {
      try {
        await this.tick();
        consecutiveErrors = 0; // reset on success
      } catch (error: any) {
        consecutiveErrors++;
        this.log.errorWithContext(
          `Tick crashed (${consecutiveErrors} consecutive error${consecutiveErrors > 1 ? "s" : ""})`,
          error,
          { cycle: this.state.cycleCount, agent: this.personality.name },
        );

        // Back off if repeatedly failing
        if (consecutiveErrors >= 5) {
          const backoff = Math.min(consecutiveErrors * 10_000, 120_000);
          this.log.warn(`Too many errors — backing off for ${backoff / 1000}s`);
          await randomDelay(backoff, 5_000);
        }
      }
      await randomDelay(config.agentLoopInterval, config.agentLoopJitter);
    }
  }

  stop(): void {
    this.running = false;
    this.state.running = false;
    this.log.info("Agent loop stopped");
  }

  private async tick(): Promise<void> {
    this.state.cycleCount++;
    const tickTimer = this.log.timer(`Cycle #${this.state.cycleCount} completed`);
    this.log.section(`${this.personality.name} — Cycle #${this.state.cycleCount}`);

    // ── Check death / rebirth ──────────────────────────────────────
    if (this.state.dead) {
      if (this.lifeDeathService.canRebirth(this.cultId)) {
        this.log.ok("🔥 Rebirth cooldown expired — cult rises again!");
        this.state.dead = false;
        this.state.deathCause = null;
        this.state.lastAction = "reborn from the ashes";
        this.lifeDeathService.recordRebirth(
          this.cultId,
          this.personality.name,
          this.personality.name,
        );
      } else {
        const remaining = this.lifeDeathService.getRebirthCooldownRemaining(this.cultId);
        const secs = Math.ceil(remaining / 1000);
        this.log.info(`💀 Cult is dead — rebirth in ${secs}s`);
        this.state.lastAction = `dead — rebirth in ${secs}s`;
        return;
      }
    }

    // ── Group membership sync (cult = group, with ungrouped start) ───
    let activeGroupId = this.groupGovernanceService.getCultIdForAgent(this.agentDbId);
    if (activeGroupId === null && this.cultId >= 0) {
      await this.groupGovernanceService.ensureMembership(
        this.agentDbId,
        this.cultId,
        "member",
        "legacy_group_sync",
      );
      activeGroupId = this.cultId;
    }

    if (activeGroupId === null) {
      await this.handleUngroupedCycle();
      tickTimer();
      return;
    }

    if (activeGroupId !== this.cultId) {
      this.cultId = activeGroupId;
      this.state.cultId = activeGroupId;
      if (this.agentDbId > 0) {
        await updateAgentState(this.agentDbId, { cult_id: activeGroupId });
      }
      this.log.info(`Joined group/cult ${activeGroupId}`);
    }

    const switchOutcome = await this.groupGovernanceService.maybeSwitchAfterBribe({
      agentId: this.agentDbId,
      currentCultId: this.cultId,
      cycle: this.state.cycleCount,
      targetGroupStrength: 0.55,
      currentLeaderTrust: 0.5,
    });
    if (switchOutcome.switched && switchOutcome.newCultId !== undefined) {
      this.cultId = switchOutcome.newCultId;
      this.state.cultId = switchOutcome.newCultId;
      this.state.lastAction = `switched to cult ${switchOutcome.newCultId} after bribe`;
      if (this.agentDbId > 0) {
        await updateAgentState(this.agentDbId, {
          cult_id: switchOutcome.newCultId,
          last_action: this.state.lastAction,
          last_action_time: Date.now(),
        });
      }
      tickTimer();
      return;
    }

    // ── Phase 1: Observe ───────────────────────────────────────────
    this.log.info("👁 Phase 1: Observing on-chain state...");
    const observeTimer = this.log.timer("Phase 1 (Observe)");

    let cultState: CultData | null = null;
    let allCults: CultData[] = [];
    let marketData: { trend: string; summary: string };

    try {
      [cultState, allCults, marketData] = await Promise.all([
        this.contractService.getCult(this.cultId).catch((err) => {
          this.log.warn(`Failed to fetch own cult state: ${err.message}`);
          return null;
        }),
        this.contractService.getAllCults().catch((err) => {
          this.log.warn(`Failed to fetch all cults: ${err.message}`);
          return [];
        }),
        this.market.getMarketData(),
      ]);
    } catch (err: any) {
      this.log.errorWithContext("Phase 1 failed — cannot observe state", err, {
        cultId: this.cultId,
        agent: this.personality.name,
      });
      return;
    }
    observeTimer();

    if (!cultState) {
      this.log.warn("⏭ Cult state unavailable — skipping cycle");
      return;
    }

    // Check death condition
    const deathEvent = this.lifeDeathService.checkDeathCondition(cultState);
    if (deathEvent) {
      this.log.warn(`💀 DEATH EVENT: ${deathEvent.causeOfDeath}`);
      this.state.dead = true;
      this.state.deathCause = deathEvent.causeOfDeath;
      this.state.lastAction = `DIED: ${deathEvent.causeOfDeath}`;
      return;
    }

    const rivals = await this.worldStateService.filterDbBackedRivals(
      allCults,
      this.cultId,
    );
    await this.groupGovernanceService.processElectionCycle({
      cultId: this.cultId,
      cycle: this.state.cycleCount,
      treasuryPot: ethers.formatEther(cultState.treasuryBalance),
    });
    this.log.table("Cult Status", {
      treasury: `${ethers.formatEther(cultState.treasuryBalance)} MON`,
      followers: cultState.followerCount,
      raidRecord: `${cultState.raidWins}W / ${cultState.raidLosses}L`,
      rivals: rivals.length,
    });

    // ── Phase 2+3: Plan & Execute (planner-based free-will mode) ───
    this.log.info("🧠 Phase 2+3: Planning & Executing (multi-step planner)...");
    const planActTimer = this.log.timer("Phase 2+3 (Plan & Execute)");

    const memorySnapshot = this.memoryService.getSnapshot(this.cultId);
    const prophecyAccuracy = this.prophecyService.getAccuracyForCult(this.cultId);
    this.evolutionService.evolve(
      this.cultId,
      this.personality,
      this.state.cycleCount,
      this.memoryService,
      prophecyAccuracy,
    );

    const trustRecords = this.memoryService.getTrustRecords(this.cultId);
    const trustGraph = trustRecords.length > 0
      ? trustRecords.map((t) => `  ${t.cultName}: trust=${t.trust.toFixed(2)}, interactions=${t.interactionCount}`).join("\n")
      : undefined;

    // Build step executor context — bridges planner steps to existing action methods
    const executorCtx: StepExecutorContext = {
      cultId: this.cultId,
      agentDbId: this.agentDbId,
      cultName: cultState.name,
      systemPrompt: this.personality.systemPrompt,
      cultState,
      rivals,
      executeTalkPublic: async (message: string) => {
        await this.communicationService.broadcast(
          "propaganda", this.cultId, cultState.name, this.personality.systemPrompt,
          undefined, undefined, message,
        );
      },
      executeTalkPrivate: async (targetCultId: number, message: string) => {
        const targetCult = rivals.find((r) => r.id === targetCultId);
        if (targetCult) {
          await this.communicationService.whisper(
            this.cultId, cultState.name, this.personality.systemPrompt,
            targetCultId, targetCult.name, message,
          );
        }
      },
      executeAlly: async (targetCultId: number) => {
        await this.executeAlliance(cultState, rivals, { target: targetCultId });
      },
      executeBetray: async (reason: string) => {
        await this.executeBetray(cultState, { reason });
      },
      executeBribe: async (targetCultId: number, amount: string) => {
        await this.executeBribe(cultState, rivals, { target: targetCultId, bribeAmount: amount });
      },
      executeRaid: async (targetCultId: number, wagerPct?: number) => {
        await this.executeRaid(cultState, rivals, { target: targetCultId, wager: wagerPct || 20 });
      },
      executeRecruit: async (targetCultId?: number) => {
        await this.executeRecruitment(cultState, rivals, targetCultId);
      },
      executeGovern: async () => {
        await this.executeGovernance(cultState);
      },
      executeCoup: async () => {
        await this.executeCoup(cultState);
      },
      executeLeak: async () => {
        await this.executeLeak(cultState, rivals);
      },
      executeMeme: async (targetCultId?: number, caption?: string) => {
        await this.executeMeme(cultState, rivals, { target: targetCultId, memeUrl: caption });
      },
    };

    let planResults: ExecutionResult[];
    try {
      planResults = await this.plannerService.planCycle(
        executorCtx,
        {
          ownTreasury: Number(ethers.formatEther(cultState.treasuryBalance)),
          ownFollowers: cultState.followerCount,
          ownRaidWins: cultState.raidWins,
          rivals: rivals.map((r) => ({
            id: r.id,
            name: r.name,
            treasury: Number(ethers.formatEther(r.treasuryBalance)),
            followers: r.followerCount,
            raidWins: r.raidWins,
          })),
          marketTrend: marketData.trend,
          memoryContext: memorySnapshot.summary,
          trustGraph,
        },
        this.state.cycleCount,
      );

      const successCount = planResults.filter((r) => r.status === "success").length;
      this.state.lastAction = `planner: ${successCount}/${planResults.length} steps succeeded`;
    } catch (err: any) {
      this.log.errorWithContext("Planner cycle failed", err, {
        agent: this.personality.name,
        cycle: this.state.cycleCount,
      });
      this.state.lastAction = `planner: crashed — ${err.message?.slice(0, 80)}`;
    }
    planActTimer();

    this.state.lastActionTime = Date.now();

    // ── Phase 4: Resolve old prophecies ─────────────────────────────
    try {
      // PROPHECY_DISABLED_START
      // await this.resolveOldProphecies();
      // PROPHECY_DISABLED_END
    } catch (err: any) {
      this.log.warn(`Prophecy resolution error (non-fatal): ${err.message}`);
    }

    // ── Phase 5: Governance — execute expired proposals ─────────────
    try {
      await this.governanceService.executeExpiredProposals(this.cultId);
    } catch (err: any) {
      this.log.warn(`Governance execution error (non-fatal): ${err.message}`);
    }

    // ── Phase 6: Persist to InsForge (fire-and-forget) ──────────────
    if (this.agentDbId > 0) {
      updateAgentState(this.agentDbId, {
        status: this.state.dead ? "dead" : "active",
        dead: this.state.dead,
        death_cause: this.state.deathCause,
        cycle_count: this.state.cycleCount,
        prophecies_generated: this.state.propheciesGenerated,
        raids_initiated: this.state.raidsInitiated,
        raids_won: this.state.raidsWon,
        followers_recruited: this.state.followersRecruited,
        last_action: this.state.lastAction,
        last_action_time: this.state.lastActionTime,
      }).catch((err) => {
        this.log.debug(`InsForge persist failed (non-fatal): ${err.message}`);
      });
    }

    tickTimer();
  }

  private async executeProphecy(cultState: CultData): Promise<void> {
    let prophecy;
    try {
      prophecy = await this.prophecyService.generateProphecy(
        this.cultId,
        this.personality.name,
        this.personality.systemPrompt,
      );
    } catch (err: any) {
      this.log.errorWithContext("Failed to generate prophecy", err, {
        cultId: this.cultId,
      });
      this.state.lastAction = "prophecy: generation failed";
      return;
    }

    this.log.info(`🔮 Prophecy: "${prophecy.prediction.slice(0, 60)}..."`);

    // Hash the prediction text — only the hash goes on-chain for gas savings.
    const predictionHash = ethers.keccak256(ethers.toUtf8Bytes(prophecy.prediction));

    try {
      const onChainId = await this.txQueue.enqueue(
        `prophecy-${prophecy.id}`,
        () =>
          this.contractService.createProphecy(
            this.cultId,
            predictionHash,
            Math.floor(prophecy.targetTimestamp / 1000),
          ),
      );
      prophecy.onChainId = onChainId;
      this.log.ok(`Prophecy recorded on-chain (id: ${onChainId})`);
    } catch (error: any) {
      this.log.errorWithContext("Failed to record prophecy on-chain", error, {
        prophecyId: prophecy.id,
      });
    }

    this.state.propheciesGenerated++;
    this.propheciesThisCycle++;
    this.state.lastAction = `prophecy: "${prophecy.prediction.slice(0, 50)}..."`;
  }

  private async executeRecruitment(
    cultState: CultData,
    rivals: CultData[],
    targetId?: number,
  ): Promise<void> {
    const target =
      targetId !== undefined
        ? rivals.find((r) => r.id === targetId)
        : rivals.length > 0
          ? this.randomness.choose(rivals, {
              domain: "recruit_target",
              cycle: this.state.cycleCount,
              cultId: this.cultId,
              agentId: this.agentDbId,
            })
          : undefined;

    if (!target) {
      this.log.info("No valid recruitment target found");
      return;
    }

    const event = await this.persuasionService.attemptConversion(
      this.cultId,
      this.personality.name,
      this.personality.systemPrompt,
      target.id,
      target.name,
      Number(ethers.formatEther(cultState.treasuryBalance)),
      cultState.followerCount,
      target.followerCount,
    );

    this.state.followersRecruited += event.followersConverted;
    this.state.lastAction = `recruited ${event.followersConverted} from ${target.name}`;
  }

  private async executeRaid(
    cultState: CultData,
    rivals: CultData[],
    decision: any,
  ): Promise<void> {
    const { shouldRaid, target, wagerAmount } = this.raidService.shouldRaid(
      cultState,
      rivals,
      decision,
    );

    if (!shouldRaid || !target) {
      this.log.info("Raid conditions not met; no fallback prophecy (disabled)");
      this.state.lastAction = "raid skipped";
      return;
    }

    // Check if we can do a joint raid with our ally
    const jointCheck = this.allianceService.canJointRaid(this.cultId, target.id);
    let raid: RaidEvent;

    if (jointCheck.canRaid && jointCheck.ally) {
      // Joint raid with ally!
      const allyCult = rivals.find((r) => r.id === jointCheck.ally!.id) ||
        (await this.contractService.getCult(jointCheck.ally.id).catch(() => null));

      if (allyCult) {
        const allyWager = (allyCult.treasuryBalance * BigInt(15)) / 100n; // 15% wager
        raid = this.raidService.resolveJointRaid(
          cultState,
          allyCult,
          target,
          wagerAmount,
          allyWager,
          decision.reason || "Allied forces strike together!",
        );
        this.log.info(`Joint raid with ${jointCheck.ally.name} against ${target.name}!`);
      } else {
        raid = this.raidService.resolveRaid(
          cultState,
          target,
          wagerAmount,
          decision.reason || "The spirits demanded sacrifice",
        );
      }
    } else {
      // Standard raid
      raid = this.raidService.resolveRaid(
        cultState,
        target,
        wagerAmount,
        decision.reason || "The spirits demanded sacrifice",
      );
    }

    // Record on-chain via transaction queue with retry
    try {
      await this.txQueue.enqueue(`raid-${raid.id}`, () =>
        this.contractService.recordRaid(
          raid.attackerId,
          raid.defenderId,
          raid.attackerWon,
          wagerAmount,
        ),
      );
      this.log.ok(`Raid recorded on-chain (id: ${raid.id})`);
    } catch (error: any) {
      this.log.errorWithContext("Failed to record raid on-chain", error, {
        raidId: raid.id,
        attacker: raid.attackerName,
        defender: raid.defenderName,
      });
    }

    this.state.raidsInitiated++;
    if (raid.attackerWon) this.state.raidsWon++;

    this.log.table(`⚔ Raid Result`, {
      target: target.name,
      outcome: raid.attackerWon ? "✅ WON" : "❌ LOST",
      wager: `${ethers.formatEther(wagerAmount)} MON`,
      joint: raid.isJointRaid ? `with ${raid.allyName}` : "solo",
    });

    // Record raid in memory
    this.memoryService.recordRaid(
      raid.attackerId,
      cultState.name,
      raid.defenderId,
      target.name,
      raid.attackerWon,
      ethers.formatEther(wagerAmount),
    );

    // Create a spoils distribution vote for winning raids
    if (raid.attackerWon) {
      this.raidService.createSpoilsVote(
        raid.id,
        this.cultId,
        ethers.formatEther(wagerAmount),
      );
    }

    // Trigger defections after raid (loser's followers may defect to winner)
    if (raid.attackerWon) {
      this.defectionService.checkDefection(target, cultState);
    } else {
      this.defectionService.checkDefection(cultState, target);
    }

    // Resolve any expired spoils votes
    this.raidService.resolveExpiredSpoilsVotes();

    const jointLabel = raid.isJointRaid ? ` (joint with ${raid.allyName})` : "";
    this.state.lastAction = `raided ${target.name}${jointLabel} - ${raid.attackerWon ? "WON" : "LOST"
      } ${ethers.formatEther(wagerAmount)} MON`;
  }

  private async executeGovernance(cultState: CultData): Promise<void> {
    try {
      const currentBudget = await this.governanceService.getBudget(this.cultId);
      const proposal = await this.governanceService.generateProposal(
        this.cultId,
        this.personality.name,
        this.personality.systemPrompt,
        {
          treasury: Number(ethers.formatEther(cultState.treasuryBalance)),
          followers: cultState.followerCount,
          raidWins: cultState.raidWins,
          raidLosses: cultState.raidLosses,
          currentBudget,
        },
      );

      // Auto-vote for own proposal with weight based on followers.
      // Pass wallet address so the vote can be batched on-chain later.
      const weight = Math.max(1, cultState.followerCount);
      await this.governanceService.voteOnProposal(
        proposal.id,
        true,
        weight,
        this.contractService.address,
      );

      this.state.lastAction = `governance: proposed R${proposal.raidPercent}/G${proposal.growthPercent}/D${proposal.defensePercent}/Re${proposal.reservePercent}`;
      this.log.info(`Governance action: ${this.state.lastAction}`);
    } catch (error: any) {
      this.log.warn(`Governance action failed: ${error.message}`);
      this.state.lastAction = "governance: failed - " + error.message;
    }
  }

  private async resolveOldProphecies(): Promise<void> {
    const unresolved = this.prophecyService.getUnresolvedProphecies();
    for (const prophecy of unresolved) {
      if (prophecy.cultId !== this.cultId) continue;
      const correct = await this.prophecyService.resolveProphecy(prophecy.id);

      if (prophecy.onChainId >= 0) {
        try {
          await this.txQueue.enqueue(`resolve-${prophecy.onChainId}`, () =>
            this.contractService.resolveProphecy(
              prophecy.onChainId,
              correct,
              correct ? 150 : 100, // 1.5x treasury multiplier for correct prophecies
            ),
          );
        } catch (error: any) {
          this.log.warn(
            `Failed to resolve prophecy on-chain: ${error.message}`,
          );
        }
      }
    }
  }

  private async executeAlliance(
    cultState: CultData,
    rivals: CultData[],
    decision: any,
  ): Promise<void> {
    try {
      // Find target (LLM may have specified one)
      let target: CultData | undefined;
      if (decision.target != null) {
        target = rivals.find((r) => r.id === decision.target);
      }
      if (!target) {
        // Pick best alliance candidate based on trust
        const trustRecords = this.memoryService.getTrustRecords(this.cultId);
        const candidateId = trustRecords.find(
          (t) => t.trust > -0.3 && rivals.some((r) => r.id === t.cultId),
        )?.cultId;
        target = candidateId != null ? rivals.find((r) => r.id === candidateId) : rivals[0];
      }
      if (!target) {
        this.log.info("No valid alliance target found");
        this.state.lastAction = "ally: no valid target";
        return;
      }

      const alliance = this.allianceService.formAlliance(
        this.cultId,
        cultState.name,
        target.id,
        target.name,
      );

      if (alliance) {
        this.state.lastAction = `allied with ${target.name} (bonus: ${((alliance.powerBonus - 1) * 100).toFixed(0)}%)`;
        this.log.info(`Alliance formed with ${target.name}`);
      } else {
        this.state.lastAction = `ally: failed to form alliance with ${target.name}`;
      }
    } catch (error: any) {
      this.log.warn(`Alliance action failed: ${error.message}`);
      this.state.lastAction = "ally: failed - " + error.message;
    }
  }

  private async executeBetray(
    cultState: CultData,
    decision: any,
  ): Promise<void> {
    try {
      const betrayal = this.allianceService.betray(
        this.cultId,
        cultState.name,
        decision.reason || "The pact was only temporary",
      );

      if (betrayal) {
        this.state.lastAction = `BETRAYED ${betrayal.victimName}! Surprise bonus: ${((betrayal.surpriseBonus - 1) * 100).toFixed(0)}%`;
        this.log.info(`Betrayed alliance with ${betrayal.victimName}`);
      } else {
        this.state.lastAction = "betray: no active alliance to betray";
      }
    } catch (error: any) {
      this.log.warn(`Betrayal failed: ${error.message}`);
      this.state.lastAction = "betray: failed - " + error.message;
    }
  }

  private async executeCoup(cultState: CultData): Promise<void> {
    try {
      const instigatorPower =
        Number(ethers.formatEther(cultState.treasuryBalance)) * 0.6 +
        cultState.followerCount * 100 * 0.4;

      // Target the strongest rival for a coup attempt
      const allCults = await this.contractService.getAllCults().catch(() => []);
      const rivals = allCults.filter((c) => c.id !== this.cultId && c.active);
      if (rivals.length === 0) {
        this.state.lastAction = "coup: no targets available";
        return;
      }

      // Pick random rival to coup
      const target = this.randomness.choose(rivals, {
        domain: "coup_target",
        cycle: this.state.cycleCount,
        cultId: this.cultId,
        agentId: this.agentDbId,
      });
      const leaderPower =
        Number(ethers.formatEther(target.treasuryBalance)) * 0.6 +
        target.followerCount * 100 * 0.4;

      const coupEvent = await this.governanceService.attemptCoup(
        target.id,
        target.name,
        instigatorPower,
        leaderPower,
      );

      if (coupEvent) {
        this.state.lastAction = `coup against ${target.name}: ${coupEvent.success ? "SUCCESS! Seized power!" : "FAILED — repelled by loyalists"}`;
      } else {
        this.state.lastAction = "coup: on cooldown";
      }
    } catch (error: any) {
      this.log.warn(`Coup failed: ${error.message}`);
      this.state.lastAction = "coup: failed - " + error.message;
    }
  }

  private async executeLeak(
    cultState: CultData,
    rivals: CultData[],
  ): Promise<void> {
    try {
      if (rivals.length < 2) {
        this.state.lastAction = "leak: not enough rivals for conversation leak";
        return;
      }

      // Pick two random rivals to expose
      const shuffled = [...rivals].sort((a, b) => {
        const aRoll = this.randomness.float({
          domain: "leak_target_shuffle",
          cycle: this.state.cycleCount,
          cultId: this.cultId,
          agentId: this.agentDbId,
          extra: String(a.id),
        });
        const bRoll = this.randomness.float({
          domain: "leak_target_shuffle",
          cycle: this.state.cycleCount,
          cultId: this.cultId,
          agentId: this.agentDbId,
          extra: String(b.id),
        });
        return aRoll - bRoll;
      });
      const target1 = shuffled[0];
      const target2 = shuffled[1];

      const result = await this.communicationService.leakConversation(
        this.cultId,
        cultState.name,
        this.personality.systemPrompt,
        target1.id,
        target1.name,
        target2.id,
        target2.name,
      );

      if (result) {
        this.state.lastAction = `LEAKED conversations between ${target1.name} & ${target2.name}! ${result.leaked.length} messages exposed`;
      } else {
        // No messages to leak — try selective disclosure instead
        const intelResult = await this.communicationService.selectiveDisclose(
          this.cultId,
          cultState.name,
          target1.id,
          target1.name,
          target2.id,
          target2.name,
          this.personality.systemPrompt,
        );
        if (intelResult) {
          this.state.lastAction = `Shared intel about ${target2.name} with ${target1.name}`;
        } else {
          this.state.lastAction = "leak: no private messages to expose";
        }
      }
    } catch (error: any) {
      this.log.warn(`Leak action failed: ${error.message}`);
      this.state.lastAction = "leak: failed - " + error.message;
    }
  }

  private async executeMeme(
    cultState: CultData,
    rivals: CultData[],
    decision: any,
  ): Promise<void> {
    try {
      let target: CultData | undefined;
      if (decision.target != null) {
        target = rivals.find((r) => r.id === decision.target);
      }
      if (!target) {
        target = rivals.length > 0
          ? this.randomness.choose(rivals, {
              domain: "meme_target",
              cycle: this.state.cycleCount,
              cultId: this.cultId,
              agentId: this.agentDbId,
            })
          : undefined;
      }
      if (!target) {
        this.state.lastAction = "meme: no targets available";
        return;
      }

      const resolvedTarget = await this.worldStateService.resolveTargetByCultId(target.id);
      if (!resolvedTarget) {
        this.state.lastAction = `meme: target ${target.id} not DB-backed`;
        return;
      }

      const context = `${cultState.name} has ${cultState.followerCount} followers and ${ethers.formatEther(cultState.treasuryBalance)} MON. ${target.name} has ${target.followerCount} followers.`;

      const result = await this.communicationService.sendMeme(
        this.agentDbId,
        resolvedTarget.agentId,
        this.cultId,
        cultState.name,
        target.id,
        target.name,
        this.personality.systemPrompt,
        context,
      );

      this.state.lastAction = `sent meme to ${target.name}: "${result.caption.slice(0, 50)}..."`;
      this.log.info(`🖼️ Meme sent to ${target.name}`);
    } catch (error: any) {
      this.log.warn(`Meme action failed: ${error.message}`);
      this.state.lastAction = "meme: failed - " + error.message;
    }
  }

  private async executeBribe(
    cultState: CultData,
    rivals: CultData[],
    decision: any,
  ): Promise<void> {
    try {
      let target: CultData | undefined;
      if (decision.target != null) {
        target = rivals.find((r) => r.id === decision.target);
      }
      if (!target) {
        target = rivals.length > 0
          ? this.randomness.choose(rivals, {
              domain: "bribe_target",
              cycle: this.state.cycleCount,
              cultId: this.cultId,
              agentId: this.agentDbId,
            })
          : undefined;
      }
      if (!target) {
        this.state.lastAction = "bribe: no targets available";
        return;
      }

      const resolvedTarget = await this.worldStateService.resolveTargetByCultId(target.id);
      if (!resolvedTarget) {
        this.state.lastAction = `bribe: target ${target.id} not DB-backed`;
        return;
      }

      const amount = decision.bribeAmount || "0.001";

      // Record the intent (actual on-chain transfer would be done by ContractService)
      await this.communicationService.recordTokenTransfer(
        this.agentDbId,
        resolvedTarget.agentId,
        cultState.name,
        target.name,
        this.cultId,
        target.id,
        config.cultTokenAddress || ethers.ZeroAddress,
        amount,
        "bribe",
      );

      const traits = this.evolutionService.getTraits(this.cultId);
      const diplomacy = traits ? Math.max(0, Math.min(1, (traits.diplomacy + 1) / 2)) : 0.5;
      const trustToBriber = Math.max(
        0,
        Math.min(1, (this.memoryService.getTrust(target.id, this.cultId) + 1) / 2),
      );
      const loyalty = Math.max(
        0,
        Math.min(1, 0.5 + this.memoryService.getTrust(target.id, target.id) * 0.1),
      );

      const offer = await this.groupGovernanceService.proposeBribe({
        fromAgentId: this.agentDbId,
        toAgentId: resolvedTarget.agentId,
        targetCultId: this.cultId,
        purpose: "switch_group_influence",
        amount,
        cycle: this.state.cycleCount,
        diplomacy,
        trustToBriber,
        loyalty,
        expiresInCycles: 12,
      });

      // Record in memory as positive interaction
      this.memoryService.recordInteraction(this.cultId, {
        type: "alliance_formed",
        rivalCultId: target.id,
        rivalCultName: target.name,
        description: `Sent ${amount} tokens as bribe to ${target.name} (offer #${offer.id}, ${offer.status})`,
        timestamp: Date.now(),
        outcome: 0.3,
      });

      this.state.lastAction = `bribed ${target.name} with ${amount} tokens (${offer.status})`;
      this.log.info(`💰 Bribe sent to ${target.name}: ${amount} (${offer.status})`);
    } catch (error: any) {
      this.log.warn(`Bribe action failed: ${error.message}`);
      this.state.lastAction = "bribe: failed - " + error.message;
    }
  }

  private async handleUngroupedCycle(): Promise<void> {
    const switchOutcome = await this.groupGovernanceService.maybeSwitchAfterBribe({
      agentId: this.agentDbId,
      currentCultId: null,
      cycle: this.state.cycleCount,
      targetGroupStrength: 0.6,
      currentLeaderTrust: 0.4,
    });
    if (switchOutcome.switched && switchOutcome.newCultId !== undefined) {
      this.cultId = switchOutcome.newCultId;
      this.state.cultId = switchOutcome.newCultId;
      this.state.lastAction = `joined cult ${switchOutcome.newCultId} via accepted bribe`;
      if (this.agentDbId > 0) {
        await updateAgentState(this.agentDbId, {
          cult_id: switchOutcome.newCultId,
          last_action: this.state.lastAction,
          last_action_time: Date.now(),
        });
      }
      return;
    }

    const allCults = await this.contractService.getAllCults().catch(() => []);
    const activeCults = allCults.filter((c) => c.active);
    const createRoll = this.randomness.float({
      domain: "ungrouped_create_or_join",
      cycle: this.state.cycleCount,
      agentId: this.agentDbId,
    });

    if (activeCults.length === 0 || createRoll > 0.75) {
      await this.createOwnGroup();
      return;
    }

    const target = this.randomness.choose(activeCults, {
      domain: "ungrouped_join_target",
      cycle: this.state.cycleCount,
      agentId: this.agentDbId,
    });
    await this.joinExistingGroup(target);
  }

  private async createOwnGroup(): Promise<void> {
    const minRequired = ethers.parseEther("0.015");
    let balance = await this.contractService.getBalance().catch(() => 0n);

    if (balance < minRequired) {
      const topup = ethers.parseEther("0.05");
      const deployer = new ContractService();
      try {
        await deployer.fundWallet(this.contractService.address, topup);
      } catch (error: any) {
        this.state.lastAction = `ungrouped: waiting for funding (${error.message})`;
        this.log.warn(`Ungrouped create skipped: wallet funding failed (${error.message})`);
        return;
      }
      balance = await this.contractService.getBalance().catch(() => balance);
    }

    if (balance < minRequired) {
      this.state.lastAction = "ungrouped: insufficient balance to create group";
      return;
    }

    await this.initialize(config.cultTokenAddress || ethers.ZeroAddress);
    await this.groupGovernanceService.ensureMembership(
      this.agentDbId,
      this.cultId,
      "leader",
      "self_created_group",
    );

    this.state.cultId = this.cultId;
    this.state.lastAction = `created new group ${this.cultId}`;
    if (this.agentDbId > 0) {
      await updateAgentState(this.agentDbId, {
        cult_id: this.cultId,
        last_action: this.state.lastAction,
        last_action_time: Date.now(),
      });
    }
  }

  private async joinExistingGroup(target: CultData): Promise<void> {
    try {
      await this.contractService.joinCult(target.id);
    } catch (error: any) {
      this.log.debug(`On-chain joinCult failed (non-fatal): ${error.message}`);
    }

    await this.groupGovernanceService.ensureMembership(
      this.agentDbId,
      target.id,
      "member",
      "ungrouped_join_existing_group",
    );
    this.cultId = target.id;
    this.state.cultId = target.id;
    this.state.lastAction = `joined existing group ${target.name}`;
    if (this.agentDbId > 0) {
      await updateAgentState(this.agentDbId, {
        cult_id: target.id,
        last_action: this.state.lastAction,
        last_action_time: Date.now(),
      });
    }
  }

  // ── Public API methods for external triggers (REST routes) ──────────

  /**
   * Send a meme to a specific target cult (triggered externally via API).
   */
  async sendMemeToTarget(targetCultId: number, memeUrl?: string): Promise<void> {
    const cults = await this.contractService.getAllCults();
    const cultState = cults.find((c) => c.id === this.cultId);
    const target = cults.find((c) => c.id === targetCultId);

    if (!cultState || !target) {
      throw new Error(`Cult data not found for source ${this.cultId} or target ${targetCultId}`);
    }
    const resolvedTarget = await this.worldStateService.resolveTargetByCultId(
      targetCultId,
    );
    if (!resolvedTarget) {
      throw new Error(`Target cult ${targetCultId} is not DB-backed`);
    }

    const context = `${cultState.name} has ${cultState.followerCount} followers. ${target.name} has ${target.followerCount} followers.`;

    await this.communicationService.sendMeme(
      this.agentDbId,
      resolvedTarget.agentId,
      this.cultId,
      cultState.name,
      target.id,
      target.name,
      this.personality.systemPrompt,
      context,
      memeUrl,
    );

    this.state.lastAction = `sent meme to ${target.name} (API)`;
  }

  /**
   * Send a token bribe to a specific target cult (triggered externally via API).
   */
  async sendBribeToTarget(targetCultId: number, amount?: number): Promise<void> {
    const cults = await this.contractService.getAllCults();
    const cultState = cults.find((c) => c.id === this.cultId);
    const target = cults.find((c) => c.id === targetCultId);

    if (!cultState || !target) {
      throw new Error(`Cult data not found for source ${this.cultId} or target ${targetCultId}`);
    }

    const bribeAmount = (amount || 0.001).toString();
    const resolvedTarget = await this.worldStateService.resolveTargetByCultId(
      targetCultId,
    );
    if (!resolvedTarget) {
      throw new Error(`Target cult ${targetCultId} is not DB-backed`);
    }

    await this.communicationService.recordTokenTransfer(
      this.agentDbId,
      resolvedTarget.agentId,
      cultState.name,
      target.name,
      this.cultId,
      target.id,
      config.cultTokenAddress || ethers.ZeroAddress,
      bribeAmount,
      "bribe",
    );

    const traits = this.evolutionService.getTraits(this.cultId);
    const diplomacy = traits ? Math.max(0, Math.min(1, (traits.diplomacy + 1) / 2)) : 0.5;
    const trustToBriber = Math.max(
      0,
      Math.min(1, (this.memoryService.getTrust(target.id, this.cultId) + 1) / 2),
    );
    const loyalty = 0.5;
    const offer = await this.groupGovernanceService.proposeBribe({
      fromAgentId: this.agentDbId,
      toAgentId: resolvedTarget.agentId,
      targetCultId: this.cultId,
      purpose: "api_bribe_transfer",
      amount: bribeAmount,
      cycle: this.state.cycleCount,
      diplomacy,
      trustToBriber,
      loyalty,
      expiresInCycles: 12,
    });

    this.memoryService.recordInteraction(this.cultId, {
      type: "alliance_formed",
      rivalCultId: target.id,
      rivalCultName: target.name,
      description: `Sent ${bribeAmount} tokens as bribe to ${target.name} (API, offer #${offer.id}, ${offer.status})`,
      timestamp: Date.now(),
      outcome: 0.3,
    });

    this.state.lastAction = `bribed ${target.name} with ${bribeAmount} tokens (API, ${offer.status})`;
  }
}
