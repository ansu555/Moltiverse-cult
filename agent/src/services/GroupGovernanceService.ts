import { createLogger } from "../utils/logger.js";
import { MemoryService } from "./MemoryService.js";
import { RandomnessService } from "./RandomnessService.js";
import type { AgentRow } from "./InsForgeService.js";
import {
  type BribeOfferRow,
  type GroupMembershipRow,
  type LeadershipElectionRow,
  type LeadershipPayoutRow,
  deactivateGroupMembership,
  loadBribeOffers,
  loadGroupMemberships,
  loadLeadershipElections,
  saveBribeOffer,
  saveGroupMembership,
  saveLeadershipElection,
  saveLeadershipPayout,
  saveLeadershipVote,
  updateBribeOffer,
  updateLeadershipElection,
} from "./InsForgeService.js";

const log = createLogger("GroupGovernanceService");

export interface GroupMember {
  id: number;
  agentId: number;
  cultId: number;
  role: string;
  active: boolean;
  joinedAt: number;
  leftAt: number | null;
  joinReason: string | null;
  sourceBribeId: number | null;
}

export interface LeadershipVote {
  voterAgentId: number;
  candidateAgentId: number;
  weight: number;
  rationale: string;
  bribeOfferId?: number;
}

export interface LeadershipElection {
  id: number;
  cultId: number;
  roundIndex: number;
  openedAt: number;
  closesAt: number;
  status: "open" | "closed" | "cancelled";
  winnerAgentId: number | null;
  prizeAmount: string;
  seed: string;
  votes: LeadershipVote[];
}

export interface LeadershipState {
  cultId: number;
  leaderAgentId: number | null;
  roundIndex: number;
  electionId: number | null;
  updatedAtCycle: number;
}

export interface BribeOffer extends Omit<BribeOfferRow, "created_at"> {
  createdAt: number;
}

interface PendingSwitchInfluence {
  offerId: number;
  targetCultId: number;
  normalizedAmount: number;
  acceptedAt: number;
  expiresAt: number | null;
}

export class GroupGovernanceService {
  private readonly memoryService: MemoryService;
  private readonly randomness: RandomnessService;

  private readonly memberships: GroupMember[] = [];
  private readonly activeMembershipByAgent = new Map<number, GroupMember>();

  private readonly elections: LeadershipElection[] = [];
  private readonly activeElectionByCult = new Map<number, LeadershipElection>();
  private readonly currentLeaderByCult = new Map<number, LeadershipState>();
  private readonly nextElectionCycleByCult = new Map<number, number>();
  private readonly lastProcessedCycleByCult = new Map<number, number>();

  private readonly bribeOffers: BribeOffer[] = [];
  private readonly pendingSwitchByAgent = new Map<number, PendingSwitchInfluence>();

  private localElectionId = 1_000_000;
  private localMembershipId = 1_000_000;
  private localBribeId = 1_000_000;

  constructor(memoryService: MemoryService, randomness: RandomnessService) {
    this.memoryService = memoryService;
    this.randomness = randomness;
  }

  async hydrate(agentRows: AgentRow[]): Promise<void> {
    try {
      const [dbMemberships, dbElections, dbBribes] = await Promise.all([
        loadGroupMemberships({ limit: 2000 }),
        loadLeadershipElections({ limit: 500 }),
        loadBribeOffers({ limit: 500 }),
      ]);

      for (const row of dbMemberships) this.ingestMembership(row);
      for (const electionRow of dbElections) this.ingestElection(electionRow);
      for (const offer of dbBribes) this.ingestBribeOffer(offer);
    } catch (error: any) {
      log.warn(`Governance hydrate skipped: ${error.message}`);
    }

    await this.backfillMemberships(agentRows);
  }

  getCultIdForAgent(agentId: number): number | null {
    return this.activeMembershipByAgent.get(agentId)?.cultId ?? null;
  }

  getMembers(cultId: number): GroupMember[] {
    return this.memberships
      .filter((m) => m.cultId === cultId && m.active)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  getAllMemberships(): GroupMember[] {
    return [...this.memberships].sort((a, b) => b.joinedAt - a.joinedAt);
  }

  getCurrentLeadership(cultId: number): LeadershipState {
    return (
      this.currentLeaderByCult.get(cultId) || {
        cultId,
        leaderAgentId: null,
        roundIndex: 0,
        electionId: null,
        updatedAtCycle: 0,
      }
    );
  }

  getNextElectionInfo(cultId: number): {
    nextElectionCycle: number | null;
    currentCycle: number;
    etaCycles: number | null;
  } {
    const next = this.nextElectionCycleByCult.get(cultId);
    const current = this.lastProcessedCycleByCult.get(cultId) || 0;
    if (next === undefined) {
      return {
        nextElectionCycle: null,
        currentCycle: current,
        etaCycles: null,
      };
    }
    return {
      nextElectionCycle: next,
      currentCycle: current,
      etaCycles: Math.max(0, next - current),
    };
  }

  getElections(cultId?: number): LeadershipElection[] {
    const rows =
      cultId === undefined
        ? this.elections
        : this.elections.filter((e) => e.cultId === cultId);
    return [...rows].sort((a, b) => b.openedAt - a.openedAt);
  }

  getBribeOffers(options?: {
    cultId?: number;
    status?: BribeOffer["status"];
    limit?: number;
  }): BribeOffer[] {
    const filtered = this.bribeOffers.filter((offer) => {
      if (options?.cultId !== undefined && offer.target_cult_id !== options.cultId) {
        return false;
      }
      if (options?.status && offer.status !== options.status) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => b.createdAt - a.createdAt);
    return options?.limit ? sorted.slice(0, options.limit) : sorted;
  }

  async ensureMembership(
    agentId: number,
    cultId: number,
    role = "member",
    joinReason = "manual_join",
    sourceBribeId?: number,
  ): Promise<GroupMember> {
    const existing = this.activeMembershipByAgent.get(agentId);
    if (existing && existing.cultId === cultId) return existing;

    if (existing) {
      await deactivateGroupMembership(existing.agentId, existing.cultId, Date.now(), joinReason);
      existing.active = false;
      existing.leftAt = Date.now();
      this.activeMembershipByAgent.delete(agentId);
    }

    const joinedAt = Date.now();
    const payload: Omit<GroupMembershipRow, "id"> = {
      agent_id: agentId,
      cult_id: cultId,
      role,
      active: true,
      joined_at: joinedAt,
      left_at: null,
      join_reason: joinReason,
      source_bribe_id: sourceBribeId ?? null,
    };
    const insertedId = await saveGroupMembership(payload);
    const member: GroupMember = {
      id: insertedId > 0 ? insertedId : this.localMembershipId++,
      agentId,
      cultId,
      role,
      active: true,
      joinedAt,
      leftAt: null,
      joinReason,
      sourceBribeId: sourceBribeId ?? null,
    };
    this.ingestMembership({
      id: member.id,
      agent_id: member.agentId,
      cult_id: member.cultId,
      role: member.role,
      active: member.active,
      joined_at: member.joinedAt,
      left_at: member.leftAt,
      join_reason: member.joinReason,
      source_bribe_id: member.sourceBribeId,
    });
    return member;
  }

  async removeMembership(
    agentId: number,
    cultId: number,
    reason = "manual_leave",
  ): Promise<void> {
    const current = this.activeMembershipByAgent.get(agentId);
    if (!current || current.cultId !== cultId) return;
    await deactivateGroupMembership(agentId, cultId, Date.now(), reason);
    current.active = false;
    current.leftAt = Date.now();
    this.activeMembershipByAgent.delete(agentId);
  }

  async proposeBribe(input: {
    fromAgentId: number;
    toAgentId: number;
    targetCultId: number;
    purpose: string;
    amount: string;
    cycle: number;
    diplomacy: number;
    trustToBriber: number;
    loyalty: number;
    expiresInCycles?: number;
  }): Promise<BribeOffer> {
    const normalizedAmount = this.normalizeAmount(input.amount);
    const noise =
      this.randomness.float({
        domain: "bribe_accept_noise",
        cycle: input.cycle,
        cultId: input.targetCultId,
        agentId: input.toAgentId,
      }) *
        0.12 -
      0.06;
    const acceptanceProbability = this.clamp(
      0.18 +
        0.42 * normalizedAmount +
        0.18 * input.diplomacy +
        0.17 * input.trustToBriber -
        0.12 * input.loyalty +
        noise,
      0.05,
      0.95,
    );

    const createdAt = Date.now();
    const expiresAt =
      input.expiresInCycles && input.expiresInCycles > 0
        ? createdAt + input.expiresInCycles * 30_000
        : null;

    const row: Omit<BribeOfferRow, "id"> = {
      from_agent_id: input.fromAgentId,
      to_agent_id: input.toAgentId,
      target_cult_id: input.targetCultId,
      purpose: input.purpose,
      amount: input.amount,
      status: "pending",
      acceptance_probability: acceptanceProbability,
      accepted_at: null,
      expires_at: expiresAt,
      created_at: createdAt,
    };

    const insertedId = await saveBribeOffer(row);
    const offerId = insertedId > 0 ? insertedId : this.localBribeId++;
    const roll = this.randomness.float({
      domain: "bribe_accept_roll",
      cycle: input.cycle,
      cultId: input.targetCultId,
      agentId: input.toAgentId,
      extra: String(offerId),
    });
    const accepted = roll <= acceptanceProbability;
    const acceptedAt = accepted ? Date.now() : null;
    const status: BribeOffer["status"] = accepted ? "accepted" : "rejected";
    if (insertedId > 0) {
      await updateBribeOffer(offerId, { status, accepted_at: acceptedAt });
    }

    const offer: BribeOffer = {
      id: offerId,
      from_agent_id: input.fromAgentId,
      to_agent_id: input.toAgentId,
      target_cult_id: input.targetCultId,
      purpose: input.purpose,
      amount: input.amount,
      status,
      acceptance_probability: acceptanceProbability,
      accepted_at: acceptedAt,
      expires_at: expiresAt,
      createdAt,
    };
    this.upsertBribeOffer(offer);

    if (accepted) {
      this.pendingSwitchByAgent.set(input.toAgentId, {
        offerId: offer.id,
        targetCultId: input.targetCultId,
        normalizedAmount,
        acceptedAt: acceptedAt || Date.now(),
        expiresAt,
      });
    }

    return offer;
  }

  async maybeSwitchAfterBribe(input: {
    agentId: number;
    currentCultId: number | null;
    cycle: number;
    targetGroupStrength: number;
    currentLeaderTrust: number;
  }): Promise<{ switched: boolean; newCultId?: number; probability: number }> {
    const pending = this.pendingSwitchByAgent.get(input.agentId);
    if (!pending) return { switched: false, probability: 0 };

    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      this.pendingSwitchByAgent.delete(input.agentId);
      await updateBribeOffer(pending.offerId, { status: "expired" });
      return { switched: false, probability: 0 };
    }

    const noise =
      this.randomness.float({
        domain: "bribe_switch_noise",
        cycle: input.cycle,
        cultId: pending.targetCultId,
        agentId: input.agentId,
        extra: String(pending.offerId),
      }) *
        0.2 -
      0.1;
    const probability = this.clamp(
      0.15 +
        0.55 * pending.normalizedAmount +
        0.2 * input.targetGroupStrength -
        0.2 * input.currentLeaderTrust +
        noise,
      0,
      0.98,
    );
    const roll = this.randomness.float({
      domain: "bribe_switch_roll",
      cycle: input.cycle,
      cultId: pending.targetCultId,
      agentId: input.agentId,
      extra: String(pending.offerId),
    });
    if (roll > probability) return { switched: false, probability };

    if (input.currentCultId !== null) {
      await this.removeMembership(
        input.agentId,
        input.currentCultId,
        "probabilistic_bribe_switch",
      );
    }
    await this.ensureMembership(
      input.agentId,
      pending.targetCultId,
      "member",
      "accepted_bribe_probabilistic_switch",
      pending.offerId,
    );
    this.pendingSwitchByAgent.delete(input.agentId);
    await updateBribeOffer(pending.offerId, { status: "executed" });
    this.updateBribeStatusLocal(pending.offerId, "executed");
    return { switched: true, newCultId: pending.targetCultId, probability };
  }

  async processElectionCycle(input: {
    cultId: number;
    cycle: number;
    treasuryPot: string;
  }): Promise<void> {
    const last = this.lastProcessedCycleByCult.get(input.cultId);
    if (last !== undefined && last >= input.cycle) return;
    this.lastProcessedCycleByCult.set(input.cultId, input.cycle);

    const members = this.getMembers(input.cultId);
    if (members.length === 0) return;

    if (!this.nextElectionCycleByCult.has(input.cultId)) {
      const offset = this.randomness.int(24, 48, {
        domain: "election_interval_initial",
        cycle: input.cycle,
        cultId: input.cultId,
      });
      this.nextElectionCycleByCult.set(input.cultId, input.cycle + offset);
    }

    const activeElection = this.activeElectionByCult.get(input.cultId);
    const nextCycle = this.nextElectionCycleByCult.get(input.cultId) || 0;

    if (!activeElection && input.cycle >= nextCycle) {
      const roundIndex = this.getCurrentLeadership(input.cultId).roundIndex + 1;
      const election = await this.openElection({
        cultId: input.cultId,
        roundIndex,
        cycle: input.cycle,
      });
      await this.castVotesForElection(election, members, input.cycle);
    }

    const maybeActive = this.activeElectionByCult.get(input.cultId);
    if (!maybeActive) return;
    if (input.cycle < maybeActive.closesAt) return;

    await this.closeElection(maybeActive, input.cycle, input.treasuryPot);
  }

  private async openElection(input: {
    cultId: number;
    roundIndex: number;
    cycle: number;
  }): Promise<LeadershipElection> {
    const opensAt = input.cycle;
    const closesAt = input.cycle + 4;
    const seed = `${this.randomness.seed}:${input.cultId}:${input.roundIndex}`;
    const electionPayload: Omit<LeadershipElectionRow, "id"> = {
      cult_id: input.cultId,
      round_index: input.roundIndex,
      opened_at: opensAt,
      closes_at: closesAt,
      status: "open",
      winner_agent_id: null,
      prize_amount: "0",
      seed,
    };
    const insertedId = await saveLeadershipElection(electionPayload);
    const election: LeadershipElection = {
      id: insertedId > 0 ? insertedId : this.localElectionId++,
      cultId: input.cultId,
      roundIndex: input.roundIndex,
      openedAt: opensAt,
      closesAt,
      status: "open",
      winnerAgentId: null,
      prizeAmount: "0",
      seed,
      votes: [],
    };
    this.elections.push(election);
    this.activeElectionByCult.set(input.cultId, election);
    return election;
  }

  private async castVotesForElection(
    election: LeadershipElection,
    members: GroupMember[],
    cycle: number,
  ): Promise<void> {
    for (const voter of members) {
      const candidateScores = members.map((candidate) => {
        const personalityAlignment = this.randomness.float({
          domain: "election_personality_alignment",
          cycle,
          cultId: election.cultId,
          agentId: voter.agentId,
          extra: String(candidate.agentId),
        });
        const trust = this.normalizeTrust(
          this.memoryService.getTrust(voter.cultId, candidate.cultId),
        );
        const bribeBias = this.getBribeBias(voter.agentId, election.cultId);
        const noise = this.randomness.float({
          domain: "election_vote_noise",
          cycle,
          cultId: election.cultId,
          agentId: voter.agentId,
          extra: String(candidate.agentId),
        });
        const score =
          0.45 * personalityAlignment +
          0.25 * trust +
          0.2 * bribeBias +
          0.1 * noise;
        return { candidate, score };
      });

      candidateScores.sort((a, b) => b.score - a.score);
      const topScore = candidateScores[0]?.score ?? 0;
      const tied = candidateScores.filter((c) => Math.abs(c.score - topScore) < 1e-9);
      const winner =
        tied.length > 1
          ? this.randomness.choose(
              tied,
              {
                domain: "election_vote_tiebreak",
                cycle,
                cultId: election.cultId,
                agentId: voter.agentId,
                extra: String(election.id),
              },
            ).candidate
          : candidateScores[0]!.candidate;

      const latestAcceptedBribe = this.bribeOffers.find(
        (offer) =>
          offer.to_agent_id === voter.agentId &&
          (offer.status === "accepted" || offer.status === "executed"),
      );

      const vote: LeadershipVote = {
        voterAgentId: voter.agentId,
        candidateAgentId: winner.agentId,
        weight: 1,
        rationale: "seeded-score",
        bribeOfferId: latestAcceptedBribe?.id,
      };
      election.votes.push(vote);

      await saveLeadershipVote({
        election_id: election.id,
        voter_agent_id: vote.voterAgentId,
        candidate_agent_id: vote.candidateAgentId,
        weight: vote.weight,
        rationale: vote.rationale,
        bribe_offer_id: vote.bribeOfferId ?? null,
      });
    }
  }

  private async closeElection(
    election: LeadershipElection,
    cycle: number,
    treasuryPot: string,
  ): Promise<void> {
    if (election.status !== "open") return;

    const tallies = new Map<number, number>();
    for (const vote of election.votes) {
      tallies.set(
        vote.candidateAgentId,
        (tallies.get(vote.candidateAgentId) || 0) + vote.weight,
      );
    }

    const ranked = [...tallies.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) {
      election.status = "cancelled";
      await updateLeadershipElection(election.id, { status: "cancelled" });
      this.activeElectionByCult.delete(election.cultId);
      this.scheduleNextElection(election.cultId, cycle);
      return;
    }

    const bestWeight = ranked[0][1];
    const tiedCandidates = ranked
      .filter((entry) => entry[1] === bestWeight)
      .map((entry) => entry[0]);
    const winnerAgentId =
      tiedCandidates.length === 1
        ? tiedCandidates[0]
        : this.randomness.choose(tiedCandidates, {
            domain: "election_result_tiebreak",
            cycle,
            cultId: election.cultId,
            extra: String(election.id),
          });

    election.status = "closed";
    election.winnerAgentId = winnerAgentId;
    election.prizeAmount = treasuryPot;

    await updateLeadershipElection(election.id, {
      status: "closed",
      winner_agent_id: winnerAgentId,
      prize_amount: treasuryPot,
    });

    const payoutPayload: Omit<LeadershipPayoutRow, "id"> = {
      election_id: election.id,
      cult_id: election.cultId,
      winner_agent_id: winnerAgentId,
      amount: treasuryPot,
      mode: "simulated_offchain",
      tx_hash: null,
      created_at: Date.now(),
    };
    await saveLeadershipPayout(payoutPayload);

    this.currentLeaderByCult.set(election.cultId, {
      cultId: election.cultId,
      leaderAgentId: winnerAgentId,
      roundIndex: election.roundIndex,
      electionId: election.id,
      updatedAtCycle: cycle,
    });

    this.activeElectionByCult.delete(election.cultId);
    this.scheduleNextElection(election.cultId, cycle);
  }

  private scheduleNextElection(cultId: number, cycle: number): void {
    const interval = this.randomness.int(24, 48, {
      domain: "election_interval_next",
      cycle,
      cultId,
    });
    this.nextElectionCycleByCult.set(cultId, cycle + interval);
  }

  private async backfillMemberships(agentRows: AgentRow[]): Promise<void> {
    for (const row of agentRows) {
      if (row.cult_id === null || row.cult_id < 0) continue;
      if (this.activeMembershipByAgent.has(row.id)) continue;

      const payload: Omit<GroupMembershipRow, "id"> = {
        agent_id: row.id,
        cult_id: row.cult_id,
        role: "leader",
        active: true,
        joined_at: Date.now(),
        left_at: null,
        join_reason: "backfill_agents_cult_id",
        source_bribe_id: null,
      };
      const insertedId = await saveGroupMembership(payload);
      this.ingestMembership({
        id: insertedId > 0 ? insertedId : this.localMembershipId++,
        ...payload,
      });
    }
  }

  private ingestMembership(row: GroupMembershipRow): void {
    const member: GroupMember = {
      id: row.id,
      agentId: row.agent_id,
      cultId: row.cult_id,
      role: row.role,
      active: row.active,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      joinReason: row.join_reason,
      sourceBribeId: row.source_bribe_id,
    };

    const existingIdx = this.memberships.findIndex((m) => m.id === member.id);
    if (existingIdx >= 0) this.memberships[existingIdx] = member;
    else this.memberships.push(member);

    if (member.active) this.activeMembershipByAgent.set(member.agentId, member);
    else this.activeMembershipByAgent.delete(member.agentId);
  }

  private ingestElection(row: LeadershipElectionRow): void {
    const election: LeadershipElection = {
      id: row.id,
      cultId: row.cult_id,
      roundIndex: row.round_index,
      openedAt: row.opened_at,
      closesAt: row.closes_at,
      status: row.status,
      winnerAgentId: row.winner_agent_id,
      prizeAmount: row.prize_amount,
      seed: row.seed,
      votes: [],
    };
    this.elections.push(election);
    if (election.status === "open") {
      this.activeElectionByCult.set(election.cultId, election);
    }
    if (election.status === "closed" && election.winnerAgentId !== null) {
      this.currentLeaderByCult.set(election.cultId, {
        cultId: election.cultId,
        leaderAgentId: election.winnerAgentId,
        roundIndex: election.roundIndex,
        electionId: election.id,
        updatedAtCycle: election.closesAt,
      });
    }
  }

  private ingestBribeOffer(row: BribeOfferRow): void {
    const offer: BribeOffer = {
      ...row,
      createdAt: row.created_at,
    };
    this.upsertBribeOffer(offer);
    if (offer.status === "accepted") {
      this.pendingSwitchByAgent.set(offer.to_agent_id, {
        offerId: offer.id,
        targetCultId: offer.target_cult_id,
        normalizedAmount: this.normalizeAmount(offer.amount),
        acceptedAt: offer.accepted_at || offer.createdAt,
        expiresAt: offer.expires_at,
      });
    }
  }

  private upsertBribeOffer(offer: BribeOffer): void {
    const idx = this.bribeOffers.findIndex((o) => o.id === offer.id);
    if (idx >= 0) this.bribeOffers[idx] = offer;
    else this.bribeOffers.push(offer);
  }

  private updateBribeStatusLocal(
    offerId: number,
    status: BribeOffer["status"],
  ): void {
    const idx = this.bribeOffers.findIndex((o) => o.id === offerId);
    if (idx < 0) return;
    this.bribeOffers[idx] = { ...this.bribeOffers[idx], status };
  }

  private getBribeBias(voterAgentId: number, cultId: number): number {
    const relevant = this.bribeOffers.find(
      (offer) =>
        offer.to_agent_id === voterAgentId &&
        offer.target_cult_id === cultId &&
        (offer.status === "accepted" || offer.status === "executed"),
    );
    return relevant ? this.normalizeAmount(relevant.amount) : 0;
  }

  private normalizeTrust(value: number): number {
    return this.clamp((value + 1) / 2, 0, 1);
  }

  private normalizeAmount(amount: string): number {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return this.clamp(Math.log10(1 + numeric) / Math.log10(11), 0, 1);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
