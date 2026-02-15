import { ethers } from "ethers";
import { config, GOVERNANCE_ENGINE_ABI } from "../config.js";
import { LLMService } from "./LLMService.js";
import { createLogger } from "../utils/logger.js";
import {
  saveProposal, updateProposal, loadProposals,
  saveBudget, loadBudget,
} from "./InsForgeService.js";

const log = createLogger("GovernanceService");

export interface BudgetAllocation {
    raidPercent: number;
    growthPercent: number;
    defensePercent: number;
    reservePercent: number;
    lastUpdated: number;
}

export interface ProposalData {
    id: number;
    cultId: number;
    proposer: string;
    category: number; // 0=RAID, 1=GROWTH, 2=DEFENSE, 3=RESERVE
    raidPercent: number;
    growthPercent: number;
    defensePercent: number;
    reservePercent: number;
    description: string;
    votesFor: number;
    votesAgainst: number;
    createdAt: number;
    votingEndsAt: number;
    status: number; // 0=ACTIVE, 1=PASSED, 2=REJECTED, 3=EXECUTED
}

export interface GovernanceEvent {
    type: "proposal_created" | "vote_cast" | "proposal_executed";
    cultId: number;
    proposalId: number;
    description: string;
    timestamp: number;
}

/**
 * GovernanceService — manages budget proposals and voting for cults.
 *
 * Each cycle, the agent considers:
 *   1. Whether to create a budget proposal (LLM-driven)
 *   2. Whether to vote on existing proposals
 *   3. Whether to execute expired proposals
 *
 * Falls back to off-chain simulation if no GovernanceEngine is deployed.
 */
export class GovernanceService {
    private contract: ethers.Contract | null = null;
    private llm: LLMService;
    private events: GovernanceEvent[] = [];
    private localBudgets: Map<number, BudgetAllocation> = new Map();
    private localProposals: ProposalData[] = [];
    private nextLocalId = 0;
    /** Maps local proposal id → DB id for updates */
    private proposalDbIds: Map<number, number> = new Map();

    constructor(llm: LLMService, wallet?: ethers.Wallet) {
        this.llm = llm;

        // Connect to GovernanceEngine if deployed
        if (config.governanceEngineAddress && wallet) {
            try {
                this.contract = new ethers.Contract(
                    config.governanceEngineAddress,
                    GOVERNANCE_ENGINE_ABI,
                    wallet,
                );
                log.info(`Connected to GovernanceEngine at ${config.governanceEngineAddress}`);
            } catch (err: any) {
                log.warn(`GovernanceEngine not available, using off-chain simulation: ${err.message}`);
            }
        } else {
            log.info("No GovernanceEngine address configured — running off-chain governance simulation");
        }
    }

    /**
     * Ask the LLM to generate a budget proposal based on cult state.
     */
    async generateProposal(
        cultId: number,
        cultName: string,
        systemPrompt: string,
        context: {
            treasury: number;
            followers: number;
            raidWins: number;
            raidLosses: number;
            currentBudget: BudgetAllocation | null;
        },
    ): Promise<ProposalData> {
        // Ask the LLM for budget recommendations
        const prompt = `You are the leader of "${cultName}". 
Current state: Treasury = ${context.treasury} MON, Followers = ${context.followers}, 
Raid record: ${context.raidWins}W / ${context.raidLosses}L.
${context.currentBudget ? `Current budget: Raid ${context.currentBudget.raidPercent}%, Growth ${context.currentBudget.growthPercent}%, Defense ${context.currentBudget.defensePercent}%, Reserve ${context.currentBudget.reservePercent}%` : "No current budget set."}

Propose a new budget allocation. Respond with ONLY a JSON object:
{"raid": <0-100>, "growth": <0-100>, "defense": <0-100>, "reserve": <0-100>, "description": "<one sentence strategy>"}
The numbers MUST sum to exactly 100.`;

        let raid = 30, growth = 30, defense = 20, reserve = 20;
        let description = "Balanced strategy for stability";

        try {
            const response = await this.llm.generateScripture(systemPrompt, cultName, prompt);
            const json = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
            const total = json.raid + json.growth + json.defense + json.reserve;

            if (total === 100) {
                raid = json.raid;
                growth = json.growth;
                defense = json.defense;
                reserve = json.reserve;
                description = json.description || description;
            } else {
                log.warn(`LLM budget didn't sum to 100 (got ${total}), using defaults`);
            }
        } catch (err: any) {
            log.warn(`Failed to parse LLM budget: ${err.message}, using defaults`);
        }

        // Try on-chain, fall back to off-chain
        if (this.contract) {
            try {
                // Hash description — only the hash goes on-chain for gas savings.
                // Full description text is stored in InsForge DB.
                const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));
                const tx = await this.contract.createProposal(
                    cultId,
                    raid,
                    growth,
                    defense,
                    reserve,
                    descHash,
                );
                const receipt = await tx.wait();
                const event = receipt.logs.find((l: any) => l.fragment?.name === "ProposalCreated");
                const proposalId = event ? Number(event.args[0]) : this.nextLocalId++;

                log.info(`On-chain proposal #${proposalId} created for cult ${cultId}`);
                const proposal = this.makeProposal(proposalId, cultId, raid, growth, defense, reserve, description);
                this.events.push({
                    type: "proposal_created",
                    cultId,
                    proposalId,
                    description,
                    timestamp: Date.now(),
                });
                return proposal;
            } catch (err: any) {
                log.warn(`On-chain proposal failed: ${err.message}, falling back to off-chain`);
            }
        }

        // Off-chain simulation fallback
        const proposalId = this.nextLocalId++;
        const proposal = this.makeProposal(proposalId, cultId, raid, growth, defense, reserve, description);
        this.localProposals.push(proposal);

        this.events.push({
            type: "proposal_created",
            cultId,
            proposalId,
            description,
            timestamp: Date.now(),
        });

        // Persist to InsForge DB (fire-and-forget)
        saveProposal({
            cult_id: cultId,
            proposer: "agent",
            category: proposal.category,
            raid_percent: raid,
            growth_percent: growth,
            defense_percent: defense,
            reserve_percent: reserve,
            description,
            votes_for: 0,
            votes_against: 0,
            created_at_ts: proposal.createdAt,
            voting_ends_at: proposal.votingEndsAt,
            status: 0,
        }).then((dbId) => {
            if (dbId > 0) this.proposalDbIds.set(proposalId, dbId);
        }).catch(() => {});

        log.info(`Off-chain proposal #${proposalId} for cult ${cultId}: R${raid}/G${growth}/D${defense}/Re${reserve}`);
        return proposal;
    }

    /** Pending votes queued for batch submission to on-chain GovernanceEngine */
    private pendingVotes: Array<{
        proposalId: number;
        voter: string;
        support: boolean;
        weight: number;
    }> = [];

    /**
     * Auto-vote on a proposal (agents vote based on LLM evaluation).
     * Votes are queued off-chain and submitted in a single batch transaction
     * via submitBatchVotes() to save ~63% gas vs individual castVote() calls.
     */
    async voteOnProposal(
        proposalId: number,
        support: boolean,
        weight: number,
        voterAddress?: string,
    ): Promise<void> {
        // Always record off-chain first (immediate state update)
        const proposal = this.localProposals.find((p) => p.id === proposalId);
        if (proposal && proposal.status === 0) {
            if (support) {
                proposal.votesFor += weight;
            } else {
                proposal.votesAgainst += weight;
            }

            // Persist updated vote counts (fire-and-forget)
            const dbId = this.proposalDbIds.get(proposalId);
            if (dbId) {
                updateProposal(dbId, {
                    votes_for: proposal.votesFor,
                    votes_against: proposal.votesAgainst,
                }).catch(() => {});
            }
        }

        // Queue for on-chain batch submission if GovernanceEngine is connected
        if (this.contract && voterAddress) {
            this.pendingVotes.push({ proposalId, voter: voterAddress, support, weight });
            log.info(`Vote queued for batch: proposal #${proposalId} ${support ? "FOR" : "AGAINST"} (weight: ${weight})`);
        } else {
            log.info(`Off-chain vote on #${proposalId}: ${support ? "FOR" : "AGAINST"} (weight: ${weight})`);
        }
    }

    /**
     * Submit all queued votes to the GovernanceEngine in a single batch transaction.
     * Called by the AgentOrchestrator after all agents have voted in a cycle.
     * Uses GovernanceEngine.batchCastVotes() — one tx instead of N individual txs.
     */
    async submitBatchVotes(): Promise<number> {
        if (!this.contract || this.pendingVotes.length === 0) {
            return 0;
        }

        const batch = [...this.pendingVotes];
        this.pendingVotes = [];

        const proposalIds = batch.map((v) => v.proposalId);
        const voters = batch.map((v) => v.voter);
        const supports = batch.map((v) => v.support);
        const weights = batch.map((v) => v.weight);

        try {
            const tx = await this.contract.batchCastVotes(
                proposalIds,
                voters,
                supports,
                weights,
            );
            await tx.wait();
            log.info(`Batch submitted ${batch.length} votes on-chain in 1 transaction`);
            return batch.length;
        } catch (err: any) {
            log.warn(`Batch vote submission failed: ${err.message}`);
            // Re-queue failed votes for next attempt
            this.pendingVotes.push(...batch);
            return 0;
        }
    }

    /**
     * Get the number of pending votes waiting for batch submission.
     */
    getPendingVoteCount(): number {
        return this.pendingVotes.length;
    }

    /**
     * Execute expired proposals and update budget.
     */
    async executeExpiredProposals(cultId: number): Promise<BudgetAllocation | null> {
        // Off-chain: check local proposals
        const active = this.localProposals.filter(
            (p) => p.cultId === cultId && p.status === 0 && Date.now() > p.votingEndsAt * 1000,
        );

        for (const proposal of active) {
            if (proposal.votesFor > proposal.votesAgainst) {
                proposal.status = 1; // PASSED
                const budget: BudgetAllocation = {
                    raidPercent: proposal.raidPercent,
                    growthPercent: proposal.growthPercent,
                    defensePercent: proposal.defensePercent,
                    reservePercent: proposal.reservePercent,
                    lastUpdated: Date.now(),
                };
                this.localBudgets.set(cultId, budget);

                this.events.push({
                    type: "proposal_executed",
                    cultId,
                    proposalId: proposal.id,
                    description: `PASSED: ${proposal.description}`,
                    timestamp: Date.now(),
                });

                log.info(`Proposal #${proposal.id} PASSED for cult ${cultId}`);

                // Persist proposal status + budget (fire-and-forget)
                const dbId = this.proposalDbIds.get(proposal.id);
                if (dbId) updateProposal(dbId, { status: 1 }).catch(() => {});
                saveBudget(cultId, {
                    raid_percent: budget.raidPercent,
                    growth_percent: budget.growthPercent,
                    defense_percent: budget.defensePercent,
                    reserve_percent: budget.reservePercent,
                    last_updated: budget.lastUpdated,
                }).catch(() => {});

                return budget;
            } else {
                proposal.status = 2; // REJECTED
                this.events.push({
                    type: "proposal_executed",
                    cultId,
                    proposalId: proposal.id,
                    description: `REJECTED: ${proposal.description}`,
                    timestamp: Date.now(),
                });
                log.info(`Proposal #${proposal.id} REJECTED for cult ${cultId}`);

                // Persist rejection (fire-and-forget)
                const dbId = this.proposalDbIds.get(proposal.id);
                if (dbId) updateProposal(dbId, { status: 2 }).catch(() => {});
            }
        }

        return null;
    }

    /**
     * Get the current budget for a cult.
     */
    async getBudget(cultId: number): Promise<BudgetAllocation | null> {
        if (this.contract) {
            try {
                const b = await this.contract.getBudget(cultId);
                if (b.lastUpdated > 0) {
                    return {
                        raidPercent: Number(b.raidPercent),
                        growthPercent: Number(b.growthPercent),
                        defensePercent: Number(b.defensePercent),
                        reservePercent: Number(b.reservePercent),
                        lastUpdated: Number(b.lastUpdated) * 1000,
                    };
                }
            } catch {
                // Fall through to local
            }
        }
        return this.localBudgets.get(cultId) || null;
    }

    /**
     * Use the current budget to influence raid decisions.
     * Returns true if the agent should prioritize raiding this cycle.
     */
    shouldPrioritizeRaid(cultId: number): boolean {
        const budget = this.localBudgets.get(cultId);
        if (!budget) return Math.random() > 0.5; // no budget = 50/50
        return Math.random() * 100 < budget.raidPercent;
    }

    getEvents(limit: number = 20): GovernanceEvent[] {
        return this.events.slice(-limit).reverse();
    }

    getProposals(cultId?: number): ProposalData[] {
        const proposals = cultId !== undefined
            ? this.localProposals.filter((p) => p.cultId === cultId)
            : this.localProposals;
        return [...proposals].reverse();
    }

    getAllProposals(): ProposalData[] {
        return [...this.localProposals].reverse();
    }

    getAllBudgets(): Record<number, BudgetAllocation> {
        const result: Record<number, BudgetAllocation> = {};
        for (const [cultId, budget] of this.localBudgets) {
            result[cultId] = budget;
        }
        return result;
    }

    private makeProposal(
        id: number,
        cultId: number,
        raid: number,
        growth: number,
        defense: number,
        reserve: number,
        description: string,
    ): ProposalData {
        return {
            id,
            cultId,
            proposer: "agent",
            category: raid >= growth && raid >= defense && raid >= reserve ? 0
                : growth >= defense && growth >= reserve ? 1
                    : defense >= reserve ? 2 : 3,
            raidPercent: raid,
            growthPercent: growth,
            defensePercent: defense,
            reservePercent: reserve,
            description,
            votesFor: 0,
            votesAgainst: 0,
            createdAt: Math.floor(Date.now() / 1000),
            votingEndsAt: Math.floor(Date.now() / 1000) + 300, // 5 min
            status: 0, // ACTIVE
        };
    }

    // ── Coup System (Design Doc §3.3.6) ────────────────────────────────

    private coupCooldowns: Map<number, number> = new Map();
    private coupEvents: CoupEvent[] = [];
    private static readonly COUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    private static readonly COUP_POWER_THRESHOLD = 1.5; // Need 1.5x leader's power

    /**
     * Attempt a forceful coup to seize cult leadership.
     * Succeeds if the instigator's backing power exceeds the leader's by 1.5x.
     */
    async attemptCoup(
        cultId: number,
        cultName: string,
        instigatorPower: number,
        leaderPower: number,
    ): Promise<CoupEvent | null> {
        // Check cooldown
        const lastCoup = this.coupCooldowns.get(cultId) || 0;
        if (Date.now() - lastCoup < GovernanceService.COUP_COOLDOWN_MS) {
            log.info(`Coup on cooldown for cult ${cultId}`);
            return null;
        }

        this.coupCooldowns.set(cultId, Date.now());

        const success = instigatorPower > leaderPower * GovernanceService.COUP_POWER_THRESHOLD;

        const event: CoupEvent = {
            cultId,
            cultName,
            instigatorPower,
            leaderPower,
            success,
            timestamp: Date.now(),
        };

        this.coupEvents.push(event);

        if (this.contract) {
            try {
                const tx = await this.contract.proposeCoup?.(
                    cultId,
                    Math.floor(instigatorPower),
                    Math.floor(leaderPower),
                );
                if (tx) await tx.wait();
            } catch (err: any) {
                log.warn(`On-chain coup failed: ${err.message}`);
            }
        }

        log.info(
            `⚔️ Coup attempt in ${cultName}: ${success ? "SUCCESS" : "FAILED"} ` +
            `(instigator: ${instigatorPower.toFixed(0)} vs leader: ${leaderPower.toFixed(0)})`,
        );

        return event;
    }

    getCoupEvents(limit: number = 10): CoupEvent[] {
        return this.coupEvents.slice(-limit).reverse();
    }

    /**
     * Hydrate governance state from InsForge DB on startup (crash recovery).
     */
    async hydrate(cultId: number): Promise<void> {
        try {
            // Load proposals
            const dbProposals = await loadProposals(cultId);
            for (const row of dbProposals) {
                const localId = this.nextLocalId++;
                const proposal: ProposalData = {
                    id: localId,
                    cultId: row.cult_id,
                    proposer: row.proposer || "agent",
                    category: row.category ?? 0,
                    raidPercent: row.raid_percent,
                    growthPercent: row.growth_percent,
                    defensePercent: row.defense_percent,
                    reservePercent: row.reserve_percent,
                    description: row.description,
                    votesFor: row.votes_for,
                    votesAgainst: row.votes_against,
                    createdAt: row.created_at_ts,
                    votingEndsAt: row.voting_ends_at,
                    status: row.status,
                };
                this.localProposals.push(proposal);
                this.proposalDbIds.set(localId, row.id);
            }

            // Load budget
            const dbBudget = await loadBudget(cultId);
            if (dbBudget) {
                this.localBudgets.set(cultId, {
                    raidPercent: dbBudget.raid_percent,
                    growthPercent: dbBudget.growth_percent,
                    defensePercent: dbBudget.defense_percent,
                    reservePercent: dbBudget.reserve_percent,
                    lastUpdated: dbBudget.last_updated,
                });
            }

            log.info(`Hydrated governance for cult ${cultId}: ${dbProposals.length} proposals, budget ${dbBudget ? "loaded" : "none"}`);
        } catch (err: any) {
            log.warn(`Governance hydration failed for cult ${cultId}: ${err.message}`);
        }
    }
}

export interface CoupEvent {
    cultId: number;
    cultName: string;
    instigatorPower: number;
    leaderPower: number;
    success: boolean;
    timestamp: number;
}
