import { CultData } from "../chain/ContractService.js";
import { MemoryService } from "./MemoryService.js";
import { createLogger } from "../utils/logger.js";
import { saveAlliance, updateAllianceActive, saveBetrayal } from "./InsForgeService.js";
import { RandomnessService } from "./RandomnessService.js";

const log = createLogger("AllianceService");

/**
 * An active alliance between two cults.
 */
export interface Alliance {
    id: number;
    cult1Id: number;
    cult1Name: string;
    cult2Id: number;
    cult2Name: string;
    formedAt: number;
    /** Alliance expires after this many ms */
    expiresAt: number;
    /** Whether alliance is still valid */
    active: boolean;
    /** Raid power bonus (1.0 = 100% normal, 1.25 = 25% bonus) */
    powerBonus: number;
}

export interface BetrayalEvent {
    allianceId: number;
    betrayerCultId: number;
    betrayerName: string;
    victimCultId: number;
    victimName: string;
    reason: string;
    timestamp: number;
    /** Power bonus the betrayer gets for the surprise attack */
    surpriseBonus: number;
}

export interface AllianceEvent {
    type: "alliance_formed" | "alliance_expired" | "alliance_betrayed";
    alliance: Alliance;
    betrayal?: BetrayalEvent;
    timestamp: number;
}

/**
 * AllianceService — manages temporary pacts between AI cults.
 *
 * Design Doc §4.3:
 *   - Cults form alliances for mutual raiding bonuses
 *   - Alliances last 5 minutes (hackathon speed)
 *   - Betrayal grants a one-time surprise attack bonus but destroys trust
 *   - Trust score from MemoryService influences alliance decisions
 */
export class AllianceService {
    private readonly randomness: RandomnessService;
    private alliances: Alliance[] = [];
    private betrayals: BetrayalEvent[] = [];
    private events: AllianceEvent[] = [];
    private memoryService: MemoryService;
    private nextId = 0;

    private static readonly ALLIANCE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    private static readonly ALLIANCE_POWER_BONUS = 1.25; // 25% raid power bonus
    private static readonly BETRAYAL_SURPRISE_BONUS = 1.5; // 50% power bonus for betrayal
    private static readonly MAX_ALLIANCES_PER_CULT = 1; // only 1 active alliance at a time

    constructor(memoryService: MemoryService, randomness?: RandomnessService) {
        this.memoryService = memoryService;
        this.randomness = randomness || new RandomnessService();
    }

    /**
     * Propose an alliance between two cults (both must agree).
     * Returns the alliance if formed, null if rejected.
     */
    formAlliance(
        cult1Id: number,
        cult1Name: string,
        cult2Id: number,
        cult2Name: string,
    ): Alliance | null {
        // Check no existing active alliance for either cult
        if (this.getActiveAlliance(cult1Id)) {
            log.info(`Cult ${cult1Name} already has an active alliance`);
            return null;
        }
        if (this.getActiveAlliance(cult2Id)) {
            log.info(`Cult ${cult2Name} already has an active alliance`);
            return null;
        }

        // Can't ally with yourself
        if (cult1Id === cult2Id) return null;

        const now = Date.now();
        const alliance: Alliance = {
            id: this.nextId++,
            cult1Id,
            cult1Name,
            cult2Id,
            cult2Name,
            formedAt: now,
            expiresAt: now + AllianceService.ALLIANCE_DURATION_MS,
            active: true,
            powerBonus: AllianceService.ALLIANCE_POWER_BONUS,
        };

        this.alliances.push(alliance);
        this.events.push({
            type: "alliance_formed",
            alliance,
            timestamp: now,
        });

        // Persist to InsForge (fire-and-forget)
        saveAlliance({
            cult1_id: cult1Id,
            cult1_name: cult1Name,
            cult2_id: cult2Id,
            cult2_name: cult2Name,
            formed_at: now,
            expires_at: alliance.expiresAt,
            active: true,
            power_bonus: alliance.powerBonus,
        }).then((dbId) => {
            // Store DB id for updates
            (alliance as any)._dbId = dbId;
        }).catch(() => {});

        // Record in both cults' memories
        this.memoryService.recordInteraction(cult1Id, {
            type: "alliance_formed",
            rivalCultId: cult2Id,
            rivalCultName: cult2Name,
            description: `Formed alliance with ${cult2Name}`,
            timestamp: now,
            outcome: 0.4, // positive trust impact
        });
        this.memoryService.recordInteraction(cult2Id, {
            type: "alliance_formed",
            rivalCultId: cult1Id,
            rivalCultName: cult1Name,
            description: `Formed alliance with ${cult1Name}`,
            timestamp: now,
            outcome: 0.4,
        });

        log.info(`🤝 Alliance formed: ${cult1Name} × ${cult2Name} (ID: ${alliance.id})`);
        return alliance;
    }

    /**
     * Betray an alliance for a one-time surprise attack bonus.
     * The betrayer gets a power multiplier, the victim gets a trust penalty.
     */
    betray(
        betrayerCultId: number,
        betrayerName: string,
        reason: string,
    ): BetrayalEvent | null {
        const alliance = this.getActiveAlliance(betrayerCultId);
        if (!alliance) {
            log.info(`Cult ${betrayerName} has no active alliance to betray`);
            return null;
        }

        // Determine the victim
        const victimCultId = alliance.cult1Id === betrayerCultId ? alliance.cult2Id : alliance.cult1Id;
        const victimName = alliance.cult1Id === betrayerCultId ? alliance.cult2Name : alliance.cult1Name;

        // End the alliance
        alliance.active = false;

        const now = Date.now();
        const betrayal: BetrayalEvent = {
            allianceId: alliance.id,
            betrayerCultId,
            betrayerName,
            victimCultId,
            victimName,
            reason,
            timestamp: now,
            surpriseBonus: AllianceService.BETRAYAL_SURPRISE_BONUS,
        };

        this.betrayals.push(betrayal);
        this.events.push({
            type: "alliance_betrayed",
            alliance,
            betrayal,
            timestamp: now,
        });

        // Persist betrayal to InsForge (fire-and-forget)
        const allianceDbId = (alliance as any)._dbId;
        if (allianceDbId) updateAllianceActive(allianceDbId, false).catch(() => {});
        saveBetrayal({
            alliance_id: allianceDbId || alliance.id,
            betrayer_cult_id: betrayerCultId,
            betrayer_name: betrayerName,
            victim_cult_id: victimCultId,
            victim_name: victimName,
            reason,
            surprise_bonus: AllianceService.BETRAYAL_SURPRISE_BONUS,
            timestamp: now,
        }).catch(() => {});

        // Record betrayal in memory — massive trust impact
        this.memoryService.recordInteraction(betrayerCultId, {
            type: "betrayal",
            rivalCultId: victimCultId,
            rivalCultName: victimName,
            description: `Betrayed alliance with ${victimName}: ${reason}`,
            timestamp: now,
            outcome: 0.3, // positive for betrayer (tactical gain)
        });
        this.memoryService.recordInteraction(victimCultId, {
            type: "betrayal",
            rivalCultId: betrayerCultId,
            rivalCultName: betrayerName,
            description: `${betrayerName} betrayed our alliance: ${reason}`,
            timestamp: now,
            outcome: -0.9, // massive negative trust
        });

        log.info(`🗡️ BETRAYAL: ${betrayerName} betrayed ${victimName}! (reason: ${reason})`);
        return betrayal;
    }

    /**
     * Get the active alliance for a cult, if any.
     */
    getActiveAlliance(cultId: number): Alliance | null {
        this.expireOldAlliances();
        return this.alliances.find(
            (a) => a.active && (a.cult1Id === cultId || a.cult2Id === cultId),
        ) || null;
    }

    /**
     * Get the alliance partner ID for a cult.
     */
    getAllyId(cultId: number): number | null {
        const alliance = this.getActiveAlliance(cultId);
        if (!alliance) return null;
        return alliance.cult1Id === cultId ? alliance.cult2Id : alliance.cult1Id;
    }

    /**
     * Check if two cults are currently allied.
     */
    areAllied(cultId1: number, cultId2: number): boolean {
        const alliance = this.getActiveAlliance(cultId1);
        if (!alliance) return false;
        return alliance.cult1Id === cultId2 || alliance.cult2Id === cultId2;
    }

    /**
     * Get the power bonus for a cult based on active alliances.
     */
    getPowerBonus(cultId: number): number {
        const alliance = this.getActiveAlliance(cultId);
        return alliance ? alliance.powerBonus : 1.0;
    }

    /**
     * Decide whether forming an alliance with a target makes sense.
     * Uses trust scores and power analysis.
     */
    shouldAlly(
        cultId: number,
        targetId: number,
        cultPower: number,
        targetPower: number,
    ): { recommend: boolean; reason: string } {
        // Already allied?
        if (this.getActiveAlliance(cultId)) {
            return { recommend: false, reason: "Already in an active alliance" };
        }

        // Check trust
        const trust = this.memoryService.getTrust(cultId, targetId);

        // Very low trust = don't ally
        if (trust < -0.5) {
            return { recommend: false, reason: `Trust too low (${trust.toFixed(2)}) — they betrayed us` };
        }

        // Stronger cults don't benefit as much from alliance
        const powerRatio = cultPower / Math.max(1, targetPower);
        if (powerRatio > 3) {
            return { recommend: false, reason: "They're too weak to be useful" };
        }

        // Weak cults seek allies
        if (powerRatio < 0.5) {
            return { recommend: true, reason: `We're weaker — alliance buffs our power by ${((AllianceService.ALLIANCE_POWER_BONUS - 1) * 100).toFixed(0)}%` };
        }

        // Moderate trust = ally
        if (trust > 0.1) {
            return { recommend: true, reason: `Positive trust (${trust.toFixed(2)}) — good alliance candidate` };
        }

        // Default: 30% chance
        const neutralRoll = this.randomness.float({
            domain: "alliance_neutral_risk",
            cycle: this.events.length,
            cultId,
            agentId: targetId,
        });
        return {
            recommend: neutralRoll < 0.3,
            reason: "Neutral stance — taking a calculated risk",
        };
    }

    /**
     * Decide whether to betray current alliance.
     */
    shouldBetray(cultId: number, cultPower: number, allyPower: number): boolean {
        const alliance = this.getActiveAlliance(cultId);
        if (!alliance) return false;

        const allyId = this.getAllyId(cultId)!;
        const trust = this.memoryService.getTrust(cultId, allyId);
        const cycle = this.events.length + this.betrayals.length + this.alliances.length;

        // High trust = very unlikely to betray
        if (trust > 0.5) {
            return (
                this.randomness.float({
                    domain: "betray_high_trust",
                    cycle,
                    cultId,
                    agentId: allyId,
                }) < 0.05
            ); // 5% chance
        }

        // If we're much stronger, betrayal is tempting
        const powerRatio = cultPower / Math.max(1, allyPower);
        if (powerRatio > 2) {
            return (
                this.randomness.float({
                    domain: "betray_power_advantage",
                    cycle,
                    cultId,
                    agentId: allyId,
                }) < 0.3
            ); // 30% chance
        }

        // Near end of alliance, betrayal becomes attractive
        const timeLeft = alliance.expiresAt - Date.now();
        if (timeLeft < 60000) {
            return (
                this.randomness.float({
                    domain: "betray_last_minute",
                    cycle,
                    cultId,
                    agentId: allyId,
                }) < 0.2
            ); // 20% in last minute
        }

        return (
            this.randomness.float({
                domain: "betray_base",
                cycle,
                cultId,
                agentId: allyId,
            }) < 0.08
        ); // 8% base chance
    }

    getEvents(limit: number = 20): AllianceEvent[] {
        return this.events.slice(-limit).reverse();
    }

    getAllAlliances(): Alliance[] {
        this.expireOldAlliances();
        return [...this.alliances].reverse();
    }

    getActiveAlliances(): Alliance[] {
        this.expireOldAlliances();
        return this.alliances.filter((a) => a.active);
    }

    getBetrayals(): BetrayalEvent[] {
        return [...this.betrayals].reverse();
    }

    // ── Joint Raid Coordination (Design Doc §3.5.2) ────────────────

    /**
     * Check if a joint raid is possible — the cult has an active ally willing to raid.
     * Returns the ally if conditions are met.
     */
    canJointRaid(
        cultId: number,
        targetId: number,
    ): { canRaid: boolean; ally: { id: number; name: string } | null } {
        const alliance = this.getActiveAlliance(cultId);
        if (!alliance) {
            return { canRaid: false, ally: null };
        }

        // Determine ally
        const allyId = alliance.cult1Id === cultId ? alliance.cult2Id : alliance.cult1Id;
        const allyName = alliance.cult1Id === cultId ? alliance.cult2Name : alliance.cult1Name;

        // Can't jointly raid your own ally
        if (allyId === targetId) {
            return { canRaid: false, ally: null };
        }

        // Must be a JOINT_OFFENSE or MUTUAL_DEFENSE type alliance
        // (In our system all alliances grant the bonus, so we allow it)
        return {
            canRaid: true,
            ally: { id: allyId, name: allyName },
        };
    }

    /**
     * Get the combined power bonus for a joint raid.
     * Allied cults get their individual power summed + a coordination bonus.
     */
    getJointRaidPowerBonus(): number {
        return AllianceService.ALLIANCE_POWER_BONUS;
    }

    // ── Private ──────────────────────────────────────────

    private expireOldAlliances(): void {
        const now = Date.now();
        for (const alliance of this.alliances) {
            if (alliance.active && now > alliance.expiresAt) {
                alliance.active = false;
                this.events.push({
                    type: "alliance_expired",
                    alliance,
                    timestamp: now,
                });
                log.info(`Alliance #${alliance.id} expired: ${alliance.cult1Name} × ${alliance.cult2Name}`);
            }
        }
    }
}
