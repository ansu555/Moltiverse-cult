import { createHash } from "crypto";
import { config } from "../config.js";

interface RandomKey {
  domain: string;
  cycle: number;
  cultId?: number | null;
  agentId?: number | null;
  extra?: string;
}

/**
 * Deterministic PRNG helper. The same input tuple always yields the same output.
 */
export class RandomnessService {
  readonly seed: string;

  constructor(seed = config.simulationSeed) {
    this.seed = seed;
  }

  float(key: RandomKey): number {
    const value = this.hashToUnitFloat(key);
    // Guarantee the upper bound is exclusive.
    return value >= 1 ? 0.9999999999999999 : value;
  }

  int(min: number, max: number, key: RandomKey): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("RandomnessService.int requires finite bounds");
    }
    if (max < min) {
      throw new Error("RandomnessService.int requires max >= min");
    }
    const span = max - min + 1;
    return min + Math.floor(this.float(key) * span);
  }

  choose<T>(items: T[], key: RandomKey): T {
    if (items.length === 0) {
      throw new Error("RandomnessService.choose requires a non-empty array");
    }
    const idx = this.int(0, items.length - 1, key);
    return items[idx];
  }

  private hashToUnitFloat(key: RandomKey): number {
    const raw = [
      this.seed,
      key.domain,
      `cycle:${key.cycle}`,
      `cult:${key.cultId ?? "x"}`,
      `agent:${key.agentId ?? "x"}`,
      `extra:${key.extra ?? "x"}`,
    ].join("|");
    const digest = createHash("sha256").update(raw).digest("hex");
    const mantissaHex = digest.slice(0, 13); // 52 bits
    const numerator = parseInt(mantissaHex, 16);
    return numerator / 0x10000000000000;
  }
}

