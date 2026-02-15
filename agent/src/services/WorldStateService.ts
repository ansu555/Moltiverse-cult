import type { CultData } from "../chain/ContractService.js";
import { createLogger } from "../utils/logger.js";
import type { AgentRow, ResolvedAgentTarget } from "./InsForgeService.js";
import { loadAllAgents } from "./InsForgeService.js";

const log = createLogger("WorldStateService");

/**
 * Builds a DB-backed world view for action targeting.
 * This prevents actions against chain-only cults that do not map to agent rows.
 */
export class WorldStateService {
  private cacheMs = 5000;
  private lastHydratedAt = 0;
  private activeAgents: AgentRow[] = [];
  private allAgentsCache: AgentRow[] = []; // Cache all agents including recruits

  private async hydrateIfNeeded(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastHydratedAt < this.cacheMs) return;
    try {
      const rows = await loadAllAgents();
      this.allAgentsCache = rows.filter((row) => row.status !== "stopped");
      this.activeAgents = rows.filter(
        (row) => row.status !== "stopped" && row.cult_id !== null && row.cult_id >= 0,
      );
      this.lastHydratedAt = now;
    } catch (error: any) {
      log.warn(`Failed to hydrate world state: ${error.message}`);
    }
  }

  async filterDbBackedRivals(
    allCults: CultData[],
    selfCultId: number,
  ): Promise<CultData[]> {
    await this.hydrateIfNeeded();
    const validCultIds = new Set<number>(
      this.activeAgents
        .map((row) => row.cult_id)
        .filter((id): id is number => id !== null && id >= 0),
    );
    return allCults.filter(
      (cult) => cult.active && cult.id !== selfCultId && validCultIds.has(cult.id),
    );
  }

  async resolveTargetByCultId(cultId: number): Promise<ResolvedAgentTarget | null> {
    await this.hydrateIfNeeded();
    const row = this.activeAgents.find((agent) => agent.cult_id === cultId);
    if (!row || row.cult_id === null || row.cult_id < 0) return null;
    return {
      agentId: row.id,
      cultId: row.cult_id,
      name: row.name,
      walletAddress: row.wallet_address,
    };
  }

  async listDbBackedCultIds(): Promise<number[]> {
    await this.hydrateIfNeeded();
    return this.activeAgents
      .map((row) => row.cult_id)
      .filter((id): id is number => id !== null && id >= 0);
  }

  /**
   * Get agents available for recruitment (cult_id = null, not in any cult yet)
   */
  async getRecruitableAgents(): Promise<AgentRow[]> {
    await this.hydrateIfNeeded(true); // Force refresh to get latest recruit status
    const recruitable = this.allAgentsCache.filter(
      (row) => row.cult_id === null && row.status !== "stopped",
    );
    log.debug(`Found ${recruitable.length} recruitable agents (total cached: ${this.allAgentsCache.length})`);
    return recruitable;
  }

  /**
   * Force refresh the agent cache (e.g., after recruitment)
   */
  invalidateCache(): void {
    this.lastHydratedAt = 0;
  }
}
