import { ethers } from "ethers";
import { config, CULT_REGISTRY_ABI } from "../config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ContractService");

export interface CultData {
  id: number;
  leader: string;
  name: string;
  prophecyPrompt: string;
  tokenAddress: string;
  treasuryBalance: bigint;
  followerCount: number;
  raidWins: number;
  raidLosses: number;
  createdAt: number;
  active: boolean;
}

function parseCult(raw: any): CultData {
  return {
    id: Number(raw.id),
    leader: raw.leader,
    name: raw.name,
    prophecyPrompt: raw.prophecyPrompt,
    tokenAddress: raw.tokenAddress,
    treasuryBalance: raw.treasuryBalance,
    followerCount: Number(raw.followerCount),
    raidWins: Number(raw.raidWins),
    raidLosses: Number(raw.raidLosses),
    createdAt: Number(raw.createdAt),
    active: raw.active,
  };
}

export class ContractService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private registry: ethers.Contract;

  constructor(privateKey?: string) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(
      privateKey || config.privateKey,
      this.provider,
    );
    this.registry = new ethers.Contract(
      config.cultRegistryAddress,
      CULT_REGISTRY_ABI,
      this.wallet,
    );
  }

  get address(): string {
    return this.wallet.address;
  }

  async getBalance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }

  async registerCult(
    name: string,
    prophecyPrompt: string,
    tokenAddress: string,
    initialTreasury: bigint = 0n,
  ): Promise<number> {
    log.info(`Registering cult: ${name}`);
    const tx = await this.registry.registerCult(
      name,
      prophecyPrompt,
      tokenAddress,
      {
        value: initialTreasury,
      },
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => {
      try {
        return (
          this.registry.interface.parseLog({
            topics: l.topics as string[],
            data: l.data,
          })?.name === "CultRegistered"
        );
      } catch {
        return false;
      }
    });
    if (event) {
      const parsed = this.registry.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      const cultId = Number(parsed!.args.cultId);
      log.info(`Cult registered with ID: ${cultId}`);
      return cultId;
    }
    const total = await this.registry.getTotalCults();
    return Number(total) - 1;
  }

  async recordRaid(
    attackerId: number,
    defenderId: number,
    attackerWon: boolean,
    amount: bigint,
  ): Promise<void> {
    log.info(
      `Recording raid: ${attackerId} vs ${defenderId}, winner: ${
        attackerWon ? "attacker" : "defender"
      }`,
    );
    const tx = await this.registry.recordRaid(
      attackerId,
      defenderId,
      attackerWon,
      amount,
    );
    await tx.wait();
    log.info("Raid recorded on-chain");
  }

  async createProphecy(
    cultId: number,
    prediction: string,
    targetTimestamp: number,
  ): Promise<number> {
    log.info(
      `Creating prophecy for cult ${cultId}: ${prediction.slice(0, 50)}...`,
    );
    const tx = await this.registry.createProphecy(
      cultId,
      prediction,
      targetTimestamp,
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => {
      try {
        return (
          this.registry.interface.parseLog({
            topics: l.topics as string[],
            data: l.data,
          })?.name === "ProphecyCreated"
        );
      } catch {
        return false;
      }
    });
    if (event) {
      const parsed = this.registry.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      return Number(parsed!.args.prophecyId);
    }
    return -1;
  }

  async resolveProphecy(
    prophecyId: number,
    correct: boolean,
    multiplier: number,
  ): Promise<void> {
    const tx = await this.registry.resolveProphecy(
      prophecyId,
      correct,
      multiplier,
    );
    await tx.wait();
    log.info(
      `Prophecy ${prophecyId} resolved: correct=${correct}, multiplier=${multiplier}`,
    );
  }

  async depositToTreasury(cultId: number, amount: bigint): Promise<void> {
    const tx = await this.registry.depositToTreasury(cultId, { value: amount });
    await tx.wait();
  }

  async joinCult(cultId: number): Promise<void> {
    log.info(`Recording follower join for cult ${cultId}`);
    const tx = await this.registry.joinCult(cultId);
    await tx.wait();
    log.info(`Follower recorded on-chain for cult ${cultId}`);
  }

  async getCult(cultId: number): Promise<CultData> {
    const raw = await this.registry.getCult(cultId);
    return parseCult(raw);
  }

  async getAllCults(): Promise<CultData[]> {
    const raw = await this.registry.getAllCults();
    return raw.map(parseCult);
  }

  async getTotalCults(): Promise<number> {
    return Number(await this.registry.getTotalCults());
  }

  async getTotalRaids(): Promise<number> {
    return Number(await this.registry.totalRaids());
  }

  /**
   * Record a defection on-chain — followers switching from one cult to another.
   */
  async recordDefection(
    fromCultId: number,
    toCultId: number,
    count: number,
    reason: string,
  ): Promise<void> {
    log.info(
      `Recording defection: ${count} followers from cult ${fromCultId} → ${toCultId}`,
    );
    try {
      const tx = await this.registry.recordDefection(
        fromCultId,
        toCultId,
        count,
        reason,
      );
      await tx.wait();
      log.info("Defection recorded on-chain");
    } catch (err: any) {
      // recordDefection may not exist on older deployments
      log.warn(`recordDefection not available on-chain: ${err.message}`);
    }
  }
}
