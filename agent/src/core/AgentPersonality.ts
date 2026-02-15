import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Personality {
  name: string;
  symbol: string;
  style: string;
  systemPrompt: string;
  description: string;
}

let cachedPersonalities: Personality[] | null = null;

function normalizePersonality(input: any): Personality | null {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim();
  const systemPrompt = String(input.systemPrompt || input.system_prompt || "").trim();
  if (!name || !systemPrompt) return null;

  const symbolCandidate = String(input.symbol || "CULT").trim().toUpperCase();
  const symbol = symbolCandidate.length > 0 ? symbolCandidate.slice(0, 12) : "CULT";
  const style = String(input.style || "custom").trim() || "custom";
  const description = String(input.description || "").trim();

  return {
    name,
    symbol,
    style,
    systemPrompt,
    description,
  };
}

function normalizePayload(raw: any): Personality[] {
  const candidates: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.agents)
      ? raw.agents
      : raw && typeof raw === "object" && raw.name
        ? [raw]
        : [];

  return candidates
    .map((entry) => normalizePersonality(entry))
    .filter((entry): entry is Personality => entry !== null);
}

function getSeedPath(): string {
  return join(__dirname, "../../data/personalities.json");
}

function getCanonicalPath(): string {
  return join(__dirname, "../../../personality.json");
}

function readAndNormalize(path: string): Personality[] {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return normalizePayload(raw);
}

function persistSeed(personalities: Personality[]): void {
  const path = getSeedPath();
  const payload = `${JSON.stringify(personalities, null, 2)}\n`;
  writeFileSync(path, payload, "utf-8");
}

export function loadPersonalities(forceReload = false): Personality[] {
  if (!forceReload && cachedPersonalities) return cachedPersonalities;

  const canonicalPath = getCanonicalPath();
  const seedPath = getSeedPath();
  let personalities: Personality[] = [];

  if (existsSync(canonicalPath)) {
    personalities = readAndNormalize(canonicalPath);
    if (personalities.length > 0) {
      persistSeed(personalities);
      cachedPersonalities = personalities;
      return cachedPersonalities;
    }
  }

  personalities = readAndNormalize(seedPath);
  if (personalities.length === 0) {
    throw new Error("No valid personalities found in personality.json or agent/data/personalities.json");
  }
  cachedPersonalities = personalities;
  return cachedPersonalities;
}

export function getPersonality(index: number): Personality {
  const personalities = loadPersonalities();
  return personalities[index % personalities.length];
}
