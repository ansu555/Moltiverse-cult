import { LLMService, AgentDecision } from "./LLMService.js";
import { CultData } from "../chain/ContractService.js";
import { createLogger } from "../utils/logger.js";
import { saveRaid, saveSpoilsVote, updateSpoilsVote } from "./InsForgeService.js";

const log = createLogger("RaidService");

export interface RaidEvent {
  id: number;
  attackerId: number;
  attackerName: string;
  defenderId: number;
  defenderName: string;
  wagerAmount: string; // MON as string
  attackerWon: boolean;
  timestamp: number;
  reason: string;
  isJointRaid?: boolean;
  allyId?: number;
  allyName?: string;
}

export interface SpoilsVote {
  id: number;
  raidId: number;
  winnerCultId: number;
  totalSpoils: string;
  treasuryVotes: number;
  stakersVotes: number;
  reinvestVotes: number;
  status: "active" | "resolved";
  result?: "treasury" | "stakers" | "reinvest";
  createdAt: number;
  endsAt: number;
}

export class RaidService {
  private raids: RaidEvent[] = [];
  private spoilsVotes: SpoilsVote[] = [];
  private nextId = 0;
  private nextSpoilsVoteId = 0;
  private cooldowns: Map<string, number> = new Map(); // "attackerId-defenderId" -> timestamp
  private cooldownDuration = 120000; // 2 minutes between same-pair raids

  shouldRaid(
    ownCult: CultData,
    rivals: CultData[],
    decision: AgentDecision
  ): { shouldRaid: boolean; target: CultData | null; wagerAmount: bigint } {
    if (decision.action !== "raid" || decision.target === undefined) {
      return { shouldRaid: false, target: null, wagerAmount: 0n };
    }

    const target = rivals.find((r) => r.id === decision.target);
    if (!target || !target.active) {
      return { shouldRaid: false, target: null, wagerAmount: 0n };
    }

    // Check cooldown
    const key = `${ownCult.id}-${target.id}`;
    const lastRaid = this.cooldowns.get(key) || 0;
    if (Date.now() - lastRaid < this.cooldownDuration) {
      log.info(`Raid on cooldown: ${key}`);
      return { shouldRaid: false, target: null, wagerAmount: 0n };
    }

    // Calculate wager
    const wagerPercent = Math.min(Math.max(decision.wager || 20, 10), 50);
    const wagerAmount = (ownCult.treasuryBalance * BigInt(wagerPercent)) / 100n;

    if (wagerAmount === 0n) {
      return { shouldRaid: false, target: null, wagerAmount: 0n };
    }

    return { shouldRaid: true, target, wagerAmount };
  }

  resolveRaid(
    attacker: CultData,
    defender: CultData,
    wagerAmount: bigint,
    reason: string
  ): RaidEvent {
    // Design doc power formula: Power = (Treasury × 0.6) + (Members × 100 × 0.4)
    // Plus ±20% randomness variance to keep raids exciting
    const attackerPower =
      Number(attacker.treasuryBalance) * 0.6 +
      attacker.followerCount * 100 * 0.4;
    const attackerScore = attackerPower * (0.8 + Math.random() * 0.4);

    const defenderPower =
      Number(defender.treasuryBalance) * 0.6 +
      defender.followerCount * 100 * 0.4;
    // Defender gets slight home advantage (+5%)
    const defenderScore = defenderPower * (0.85 + Math.random() * 0.4);

    const attackerWon = attackerScore > defenderScore;

    const raid: RaidEvent = {
      id: this.nextId++,
      attackerId: attacker.id,
      attackerName: attacker.name,
      defenderId: defender.id,
      defenderName: defender.name,
      wagerAmount: wagerAmount.toString(),
      attackerWon,
      timestamp: Date.now(),
      reason,
    };

    this.raids.push(raid);
    this.cooldowns.set(`${attacker.id}-${defender.id}`, Date.now());

    // Persist to InsForge (fire-and-forget)
    saveRaid({
      attacker_id: attacker.id,
      attacker_name: attacker.name,
      defender_id: defender.id,
      defender_name: defender.name,
      wager_amount: wagerAmount.toString(),
      attacker_won: attackerWon,
      reason,
      timestamp: raid.timestamp,
    }).catch(() => {});

    log.info(
      `Raid resolved: ${attacker.name} ${attackerWon ? "defeated" : "lost to"} ${defender.name} for ${wagerAmount} MON`
    );

    return raid;
  }

  getRecentRaids(limit: number = 20): RaidEvent[] {
    return this.raids.slice(-limit).reverse();
  }

  getRaidsByCult(cultId: number): RaidEvent[] {
    return this.raids
      .filter((r) => r.attackerId === cultId || r.defenderId === cultId)
      .reverse();
  }

  getAllRaids(): RaidEvent[] {
    return [...this.raids].reverse();
  }

  getLastRaid(): RaidEvent | null {
    return this.raids.length > 0 ? this.raids[this.raids.length - 1] : null;
  }

  // ── Spoils Distribution Vote (Design Doc §7.5) ──────────────────

  /**
   * Create a spoils distribution vote after a winning raid.
   * Members vote on: treasury (default), stakers, or reinvest.
   */
  createSpoilsVote(raidId: number, winnerCultId: number, totalSpoils: string): SpoilsVote {
    const vote: SpoilsVote = {
      id: this.nextSpoilsVoteId++,
      raidId,
      winnerCultId,
      totalSpoils,
      treasuryVotes: 0,
      stakersVotes: 0,
      reinvestVotes: 0,
      status: "active",
      createdAt: Date.now(),
      endsAt: Date.now() + 120000, // 2 minutes
    };
    this.spoilsVotes.push(vote);
    log.info(`Spoils vote #${vote.id} created for raid #${raidId} (${totalSpoils} MON)`);
    return vote;
  }

  /**
   * Cast a vote on spoils distribution.
   * @param voteId The spoils vote ID
   * @param choice "treasury" | "stakers" | "reinvest"
   */
  castSpoilsVote(voteId: number, choice: "treasury" | "stakers" | "reinvest"): void {
    const vote = this.spoilsVotes.find((v) => v.id === voteId);
    if (!vote || vote.status !== "active") return;
    if (Date.now() > vote.endsAt) return;

    if (choice === "treasury") vote.treasuryVotes++;
    else if (choice === "stakers") vote.stakersVotes++;
    else vote.reinvestVotes++;
  }

  /**
   * Resolve expired spoils votes.
   */
  resolveExpiredSpoilsVotes(): SpoilsVote[] {
    const resolved: SpoilsVote[] = [];
    for (const vote of this.spoilsVotes) {
      if (vote.status === "active" && Date.now() > vote.endsAt) {
        vote.status = "resolved";
        if (vote.stakersVotes > vote.treasuryVotes && vote.stakersVotes > vote.reinvestVotes) {
          vote.result = "stakers";
        } else if (vote.reinvestVotes > vote.treasuryVotes && vote.reinvestVotes > vote.stakersVotes) {
          vote.result = "reinvest";
        } else {
          vote.result = "treasury";
        }
        resolved.push(vote);
        log.info(`Spoils vote #${vote.id} resolved: ${vote.result}`);
      }
    }
    return resolved;
  }

  getSpoilsVotes(cultId?: number): SpoilsVote[] {
    const votes = cultId !== undefined
      ? this.spoilsVotes.filter((v) => v.winnerCultId === cultId)
      : this.spoilsVotes;
    return [...votes].reverse();
  }

  // ── Alliance Joint Raids (Design Doc §3.5.2) ───────────────────

  /**
   * Execute a joint raid with an allied cult — combined power against a defender.
   */
  resolveJointRaid(
    attacker: CultData,
    ally: CultData,
    defender: CultData,
    wager1: bigint,
    wager2: bigint,
    reason: string,
  ): RaidEvent {
    // Combined attacker power (both allies)
    const atk1Power =
      Number(attacker.treasuryBalance) * 0.6 +
      attacker.followerCount * 100 * 0.4;
    const atk2Power =
      Number(ally.treasuryBalance) * 0.6 +
      ally.followerCount * 100 * 0.4;
    const combinedPower = atk1Power + atk2Power;
    const attackerScore = combinedPower * (0.8 + Math.random() * 0.4);

    const defenderPower =
      Number(defender.treasuryBalance) * 0.6 +
      defender.followerCount * 100 * 0.4;
    const defenderScore = defenderPower * (0.85 + Math.random() * 0.4);

    const attackerWon = attackerScore > defenderScore;

    const totalWager = wager1 + wager2;
    const raid: RaidEvent = {
      id: this.nextId++,
      attackerId: attacker.id,
      attackerName: attacker.name,
      defenderId: defender.id,
      defenderName: defender.name,
      wagerAmount: totalWager.toString(),
      attackerWon,
      timestamp: Date.now(),
      reason,
      isJointRaid: true,
      allyId: ally.id,
      allyName: ally.name,
    };

    this.raids.push(raid);
    this.cooldowns.set(`${attacker.id}-${defender.id}`, Date.now());
    this.cooldowns.set(`${ally.id}-${defender.id}`, Date.now());

    log.info(
      `⚔️ Joint Raid: ${attacker.name} + ${ally.name} ${attackerWon ? "defeated" : "lost to"} ${defender.name} for ${totalWager} MON`,
    );

    return raid;
  }
}
