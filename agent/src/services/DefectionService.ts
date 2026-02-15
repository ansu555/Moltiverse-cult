import { ethers } from "ethers";
import { CultData } from "../chain/ContractService.js";
import { ContractService } from "../chain/ContractService.js";
import { MemoryService } from "./MemoryService.js";
import { createLogger } from "../utils/logger.js";
import { saveDefection } from "./InsForgeService.js";
import { RandomnessService } from "./RandomnessService.js";

const log = createLogger("DefectionService");

/**
 * A defection event — a follower leaving one cult for another.
 */
export interface DefectionEvent {
    fromCultId: number;
    fromCultName: string;
    toCultId: number;
    toCultName: string;
    followersLost: number;
    reason: string;
    timestamp: number;
}

/**
 * DefectionService — followers defect from weak cults to strong ones.
 *
 * Design Doc §4.4:
 *   - After a cult loses a raid, there's a chance followers defect
 *   - Defection probability = f(power difference, recent losses, trust)
 *   - Stronger cults with winning streaks attract defectors
 */
export class DefectionService {
    private readonly randomness: RandomnessService;
    private events: DefectionEvent[] = [];
    private memoryService: MemoryService;
    private contractService: ContractService | null = null;

    /** Minimum power ratio (winner/loser) to trigger defection check */
    private static readonly MIN_POWER_RATIO = 1.3;
    /** Base defection probability per check */
    private static readonly BASE_DEFECTION_RATE = 0.15;
    /** Maximum followers that can defect in a single event (% of total) */
    private static readonly MAX_DEFECTION_PERCENT = 0.2;
    /** Minimum followers to defect */
    private static readonly MIN_DEFECTORS = 1;
    /** Losing streak multiplier for defection */
    private static readonly STREAK_MULTIPLIER = 0.08;

    constructor(
        memoryService: MemoryService,
        contractService?: ContractService,
        randomness?: RandomnessService,
    ) {
        this.memoryService = memoryService;
        this.contractService = contractService || null;
        this.randomness = randomness || new RandomnessService();
    }

    /**
     * Check if a post-raid defection should happen.
     * Called after every raid resolution.
     *
     * @returns a DefectionEvent if followers defect, null otherwise
     */
    checkDefection(
        losingCult: CultData,
        winningCult: CultData,
    ): DefectionEvent | null {
        // Need followers to defect
        if (losingCult.followerCount < 2) return null;

        // Calculate power for both cults
        const loserPower =
            Number(losingCult.treasuryBalance) * 0.6 +
            losingCult.followerCount * 100 * 0.4;
        const winnerPower =
            Number(winningCult.treasuryBalance) * 0.6 +
            winningCult.followerCount * 100 * 0.4;

        const powerRatio = winnerPower / Math.max(1, loserPower);

        // Only check if winner is significantly stronger
        if (powerRatio < DefectionService.MIN_POWER_RATIO) return null;

        // Calculate defection probability
        let probability = DefectionService.BASE_DEFECTION_RATE;

        // Power difference scaling: larger gaps = more defections
        probability += Math.min(0.3, (powerRatio - 1) * 0.1);

        // Losing streak increases defection
        const streak = this.memoryService.getStreak(losingCult.id);
        if (streak.currentType === "loss") {
            probability += streak.currentLength * DefectionService.STREAK_MULTIPLIER;
        }

        // Trust modifier: low trust in own cult (many betrayals received) increases defection
        const trustToWinner = this.memoryService.getTrust(losingCult.id, winningCult.id);
        if (trustToWinner > 0) {
            probability += trustToWinner * 0.1; // positive trust toward winner = more defections
        }

        // Cap probability
        probability = Math.min(0.8, probability);

        // Roll the dice
        const cycle = this.events.length;
        const defectRoll = this.randomness.float({
            domain: "defection_roll",
            cycle,
            cultId: losingCult.id,
            agentId: winningCult.id,
        });
        if (defectRoll > probability) return null;

        // Calculate how many followers defect
        const maxDefectors = Math.floor(
            losingCult.followerCount * DefectionService.MAX_DEFECTION_PERCENT,
        );
        const defectors = Math.max(
            DefectionService.MIN_DEFECTORS,
            Math.floor(
                this.randomness.float({
                    domain: "defection_count",
                    cycle,
                    cultId: losingCult.id,
                    agentId: winningCult.id,
                }) * maxDefectors,
            ) + 1,
        );

        // Build defection reason
        const reasons: string[] = [];
        if (powerRatio > 2) reasons.push(`${winningCult.name} is ${powerRatio.toFixed(1)}x more powerful`);
        if (streak.currentType === "loss" && streak.currentLength >= 2) {
            reasons.push(`${losingCult.name} is on a ${streak.currentLength}-raid losing streak`);
        }
        if (reasons.length === 0) reasons.push("Lost faith after defeat");

        const event: DefectionEvent = {
            fromCultId: losingCult.id,
            fromCultName: losingCult.name,
            toCultId: winningCult.id,
            toCultName: winningCult.name,
            followersLost: defectors,
            reason: reasons.join("; "),
            timestamp: Date.now(),
        };

        this.events.push(event);

        // Persist to InsForge DB (fire-and-forget)
        saveDefection({
            from_cult_id: event.fromCultId,
            from_cult_name: event.fromCultName,
            to_cult_id: event.toCultId,
            to_cult_name: event.toCultName,
            followers_count: event.followersLost,
            reason: event.reason,
            timestamp: event.timestamp,
        }).catch(() => {});

        // Record in memory
        this.memoryService.recordInteraction(losingCult.id, {
            type: "persuasion_fail",
            rivalCultId: winningCult.id,
            rivalCultName: winningCult.name,
            description: `${defectors} followers defected to ${winningCult.name}: ${event.reason}`,
            timestamp: Date.now(),
            outcome: -0.4,
        });
        this.memoryService.recordInteraction(winningCult.id, {
            type: "persuasion_success",
            rivalCultId: losingCult.id,
            rivalCultName: losingCult.name,
            description: `${defectors} followers defected from ${losingCult.name}`,
            timestamp: Date.now(),
            outcome: 0.3,
        });

        log.info(
            `📤 Defection: ${defectors} left ${losingCult.name} → ${winningCult.name} (${event.reason})`,
        );

        // Record on-chain via CultRegistry.recordDefection()
        if (this.contractService) {
            this.recordOnChain(event).catch((err) =>
                log.warn(`Failed to record defection on-chain: ${err.message}`),
            );
        }

        return event;
    }

    /**
     * Record defection on-chain for permanent history.
     * Only the keccak256 hash of the reason goes on-chain to save gas.
     * Full reason text is persisted in InsForge DB by saveDefection().
     */
    private async recordOnChain(event: DefectionEvent): Promise<void> {
        if (!this.contractService) return;
        try {
            const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(event.reason));
            await this.contractService.recordDefection(
                event.fromCultId,
                event.toCultId,
                event.followersLost,
                reasonHash,
            );
            log.info(`On-chain defection recorded: ${event.followersLost} from cult ${event.fromCultId} → ${event.toCultId}`);
        } catch (err: any) {
            log.warn(`On-chain defection failed: ${err.message}`);
        }
    }

    /**
     * Get all defection events.
     */
    getEvents(limit: number = 20): DefectionEvent[] {
        return this.events.slice(-limit).reverse();
    }

    /**
     * Get defection events for a specific cult (as source or target).
     */
    getCultEvents(cultId: number, limit: number = 10): DefectionEvent[] {
        return this.events
            .filter((e) => e.fromCultId === cultId || e.toCultId === cultId)
            .slice(-limit)
            .reverse();
    }

    /**
     * Get stats summary.
     */
    getStats(): { totalDefections: number; totalFollowersDefected: number } {
        return {
            totalDefections: this.events.length,
            totalFollowersDefected: this.events.reduce((sum, e) => sum + e.followersLost, 0),
        };
    }
}
