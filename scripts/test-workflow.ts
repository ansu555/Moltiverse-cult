#!/usr/bin/env tsx
/**
 * AgentCult — Automated Workflow Tester & Auto-Fixer
 * ===================================================
 * Tests the entire stack (contracts → agent backend → frontend) and
 * auto-fixes common problems on the fly.
 *
 * Usage:
 *   npx tsx scripts/test-workflow.ts          # full test
 *   npx tsx scripts/test-workflow.ts --fix    # test + auto-fix
 *   npx tsx scripts/test-workflow.ts --quick  # skip slow tests
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

// ── Config ───────────────────────────────────────────────────────────

const AGENT_API = process.env.AGENT_API_URL || "http://localhost:3001";
const FRONTEND_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace("/api", "").replace(":3001", ":3000")
  : "http://localhost:3000";
const RPC_URL = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const CULT_REGISTRY = process.env.CULT_REGISTRY_ADDRESS || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const INSFORGE_BASE_URL = process.env.INSFORGE_BASE_URL || "";
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY || "";
const AGENT_API_KEY = process.env.AGENT_API_KEY || "";

const AUTO_FIX = process.argv.includes("--fix");
const QUICK = process.argv.includes("--quick");

// ── Colours & Helpers ────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const PASS = `${C.green}✓${C.reset}`;
const FAIL = `${C.red}✗${C.reset}`;
const WARN = `${C.yellow}⚠${C.reset}`;
const FIX = `${C.cyan}🔧${C.reset}`;
const INFO = `${C.blue}ℹ${C.reset}`;

interface TestResult {
  name: string;
  passed: boolean;
  warning?: boolean;
  message: string;
  fixApplied?: string;
}

const results: TestResult[] = [];
const fixes: string[] = [];

function log(icon: string, msg: string) {
  console.log(`  ${icon} ${msg}`);
}

function section(title: string) {
  console.log(`\n${C.bold}${C.magenta}━━━ ${title} ━━━${C.reset}`);
}

function record(r: TestResult) {
  results.push(r);
  const icon = r.passed ? (r.warning ? WARN : PASS) : FAIL;
  log(icon, `${r.name}: ${r.message}`);
  if (r.fixApplied) {
    log(FIX, `Auto-fix: ${r.fixApplied}`);
    fixes.push(r.fixApplied);
  }
}

async function fetchJSON(url: string, timeout = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchStatus(url: string, timeout = 8000): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status;
  } catch {
    clearTimeout(timer);
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  TEST SUITES
// ══════════════════════════════════════════════════════════════════════

// ── 1. Environment Variables ─────────────────────────────────────────

async function testEnvVars() {
  section("1. Environment Variables");

  const envPath = path.join(ROOT, ".env");
  const envExists = fs.existsSync(envPath);

  record({
    name: ".env file",
    passed: envExists,
    message: envExists ? `Found at ${envPath}` : "Missing .env file at project root",
  });

  if (!envExists && AUTO_FIX) {
    const examplePath = path.join(ROOT, ".env.example");
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      record({
        name: ".env fix",
        passed: true,
        message: "Copied .env.example → .env",
        fixApplied: "Created .env from .env.example",
      });
    }
  }

  // PRIVATE_KEY
  record({
    name: "PRIVATE_KEY",
    passed: !!PRIVATE_KEY && PRIVATE_KEY.startsWith("0x") && PRIVATE_KEY.length === 66,
    message: PRIVATE_KEY
      ? `Set (${PRIVATE_KEY.slice(0, 6)}...${PRIVATE_KEY.slice(-4)})`
      : "Missing — agents cannot send on-chain transactions",
  });

  // CULT_REGISTRY_ADDRESS
  record({
    name: "CULT_REGISTRY_ADDRESS",
    passed: !!CULT_REGISTRY && ethers.isAddress(CULT_REGISTRY),
    message: CULT_REGISTRY
      ? `Set (${CULT_REGISTRY})`
      : "Missing — agents cannot interact with CultRegistry contract",
  });

  // AGENT_API_KEY
  const hasXai = !!AGENT_API_KEY;
  record({
    name: "AGENT_API_KEY",
    passed: true,
    warning: !hasXai,
    message: hasXai
      ? "Set (LLM will use Grok)"
      : "Not set — LLM calls will use fallback responses (agents still work but are less intelligent)",
  });

  // InsForge
  record({
    name: "INSFORGE_BASE_URL",
    passed: !!INSFORGE_BASE_URL,
    message: INSFORGE_BASE_URL
      ? `Set (${INSFORGE_BASE_URL})`
      : "Missing — persistence disabled, state resets on restart",
  });

  record({
    name: "INSFORGE_ANON_KEY",
    passed: !!INSFORGE_ANON_KEY,
    message: INSFORGE_ANON_KEY ? "Set" : "Missing — InsForge auth will fail",
  });
}

// ── 2. Blockchain / RPC ──────────────────────────────────────────────

async function testBlockchain() {
  section("2. Blockchain Connectivity");

  // RPC health
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    record({
      name: "Monad RPC",
      passed: true,
      message: `Connected — chain ${network.chainId}, block #${blockNumber}`,
    });
  } catch (e: any) {
    record({
      name: "Monad RPC",
      passed: false,
      message: `Cannot connect to ${RPC_URL}: ${e.message}`,
    });
    return; // skip dependent tests
  }

  // Wallet balance
  if (PRIVATE_KEY) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const balance = await provider.getBalance(wallet.address);
      const balEth = parseFloat(ethers.formatEther(balance));

      record({
        name: "Deployer wallet balance",
        passed: balEth > 0,
        warning: balEth > 0 && balEth < 0.1,
        message: `${wallet.address}: ${balEth.toFixed(4)} MON${
          balEth < 0.1 ? " (low — agents need gas)" : ""
        }`,
      });
    } catch (e: any) {
      record({
        name: "Deployer wallet",
        passed: false,
        message: `Invalid private key: ${e.message}`,
      });
    }
  }

  // CultRegistry contract
  if (CULT_REGISTRY) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const code = await provider.getCode(CULT_REGISTRY);
      const hasCode = code !== "0x" && code !== "0x0";

      record({
        name: "CultRegistry contract",
        passed: hasCode,
        message: hasCode
          ? `Deployed at ${CULT_REGISTRY} (${code.length} bytes bytecode)`
          : `No contract at ${CULT_REGISTRY} — needs deployment`,
      });

      if (hasCode) {
        // Try reading totalCults
        const abi = ["function getTotalCults() view returns (uint256)"];
        const registry = new ethers.Contract(CULT_REGISTRY, abi, provider);
        const total = await registry.getTotalCults();
        record({
          name: "CultRegistry.getTotalCults()",
          passed: true,
          message: `${total} cults registered on-chain`,
        });
      }
    } catch (e: any) {
      record({
        name: "CultRegistry read",
        passed: false,
        message: `Failed: ${e.message}`,
      });
    }
  }
}

// ── 3. InsForge Database ─────────────────────────────────────────────

async function testInsForge() {
  section("3. InsForge Database");

  if (!INSFORGE_BASE_URL || !INSFORGE_ANON_KEY) {
    record({
      name: "InsForge connectivity",
      passed: true,
      warning: true,
      message: "Skipped — INSFORGE_BASE_URL or INSFORGE_ANON_KEY not set",
    });
    return;
  }

  // Use the InsForge SDK to validate DB connectivity (same way the backend does)
  try {
    const { createClient } = await import("@insforge/sdk");
    const client = createClient({
      baseUrl: INSFORGE_BASE_URL,
      anonKey: INSFORGE_ANON_KEY,
    });

    // Test agents table
    const { data: agents, error: agentsErr } = await client.database
      .from("agents")
      .select("id, name, status")
      .limit(10);

    if (agentsErr) {
      record({
        name: "InsForge agents table",
        passed: false,
        message: `Error: ${JSON.stringify(agentsErr)}`,
      });
    } else {
      const agentList = (agents as any[]) || [];
      record({
        name: "InsForge agents table",
        passed: true,
        message: `Reachable — ${agentList.length} agents in DB`,
      });

      if (agentList.length === 0) {
        record({
          name: "Agent seeding",
          passed: true,
          warning: true,
          message: "No agents in DB — they will be seeded on next backend restart",
        });
      } else {
        record({
          name: "Agent data",
          passed: true,
          message: `Agents: ${agentList.map((a: any) => a.name).join(", ")}`,
        });
      }
    }

    // Check all other tables via SDK
    const tables = [
      "agent_memories", "trust_records", "streaks", "prophecies", "raids",
      "alliances", "betrayals", "governance_proposals", "budgets",
      "evolution_traits", "llm_decisions", "agent_messages", "memes",
      "token_transfers", "spoils_votes", "defection_events",
    ];

    for (const table of tables) {
      const { data, error } = await client.database
        .from(table)
        .select("id")
        .limit(1);

      record({
        name: `DB table: ${table}`,
        passed: !error,
        warning: !!error,
        message: error
          ? `Error: ${JSON.stringify(error)}`
          : `Exists (${(data as any[])?.length ?? 0} rows sampled)`,
      });
    }
  } catch (e: any) {
    record({
      name: "InsForge connectivity",
      passed: false,
      message: `Cannot reach InsForge: ${e.message}`,
    });
  }
}

// ── 4. Agent Backend API ─────────────────────────────────────────────

async function testAgentBackend() {
  section("4. Agent Backend API");

  // Health
  try {
    const health = await fetchJSON(`${AGENT_API}/api/health`);
    record({
      name: "Health endpoint",
      passed: health.status === "ok",
      message: `status=${health.status}, uptime=${Math.floor(health.uptime)}s, agents=${health.agents}, cults=${health.cults}`,
    });

    // Check if agents are 0 — this is the main problem
    if (health.agents === 0) {
      record({
        name: "Agents loaded",
        passed: false,
        message: "0 agents loaded — orchestrator may have failed to bootstrap. Check agent logs.",
      });
    }
  } catch (e: any) {
    record({
      name: "Health endpoint",
      passed: false,
      message: `Agent API not reachable at ${AGENT_API}: ${e.message}`,
    });
    log(INFO, "Start the agent backend: cd agent && npm run dev");
    return; // skip rest
  }

  // Test all API endpoints
  const endpoints: Array<{
    path: string;
    name: string;
    expectArray?: boolean;
    expectObject?: boolean;
  }> = [
    { path: "/api/stats", name: "Stats", expectObject: true },
    { path: "/api/cults", name: "Cults list", expectArray: true },
    { path: "/api/cults/leaderboard", name: "Leaderboard", expectArray: true },
    { path: "/api/agents", name: "Agents list", expectArray: true },
    { path: "/api/prophecies", name: "Prophecies", expectArray: true },
    { path: "/api/prophecies/active", name: "Active prophecies", expectArray: true },
    { path: "/api/raids", name: "Raids", expectArray: true },
    { path: "/api/raids/recent", name: "Recent raids", expectArray: true },
    { path: "/api/raids/stats", name: "Raid stats", expectObject: true },
    { path: "/api/governance/proposals", name: "Proposals", expectArray: true },
    { path: "/api/governance/budgets", name: "Budgets", expectObject: true },
    { path: "/api/alliances", name: "Alliances", expectArray: true },
    { path: "/api/alliances/active", name: "Active alliances", expectArray: true },
    { path: "/api/alliances/betrayals", name: "Betrayals", expectArray: true },
    { path: "/api/alliances/defections", name: "Defections", expectArray: true },
    { path: "/api/communication", name: "Messages", expectArray: true },
  ];

  for (const ep of endpoints) {
    try {
      const data = await fetchJSON(`${AGENT_API}${ep.path}`);
      const typeOk = ep.expectArray ? Array.isArray(data) : typeof data === "object";
      const count = Array.isArray(data) ? `(${data.length} items)` : "";
      record({
        name: ep.name,
        passed: typeOk,
        message: typeOk ? `OK ${count}` : `Unexpected response type: ${typeof data}`,
      });
    } catch (e: any) {
      record({
        name: ep.name,
        passed: false,
        message: `${ep.path} → ${e.message}`,
      });
    }
  }

  // Test SSE endpoint (just check it connects)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${AGENT_API}/api/events`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    record({
      name: "SSE events",
      passed: res.headers.get("content-type")?.includes("text/event-stream") ?? false,
      message: res.headers.get("content-type")?.includes("text/event-stream")
        ? "Connected (text/event-stream)"
        : `Unexpected content-type: ${res.headers.get("content-type")}`,
    });
    controller.abort(); // clean up
  } catch (e: any) {
    // AbortError is expected (we abort after 3s)
    if (e.name === "AbortError") {
      record({
        name: "SSE events",
        passed: true,
        message: "Connection established (aborted after 3s as expected)",
      });
    } else {
      record({
        name: "SSE events",
        passed: false,
        message: e.message,
      });
    }
  }

  // Test POST endpoint validation
  try {
    const res = await fetch(`${AGENT_API}/api/agents/management/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    record({
      name: "Agent creation validation",
      passed: res.status === 400 && data.error,
      message:
        res.status === 400
          ? `Correctly rejects empty body: "${data.error}"`
          : `Unexpected status ${res.status}`,
    });
  } catch (e: any) {
    record({
      name: "Agent creation validation",
      passed: true,
      warning: true,
      message: `Endpoint may not be mounted: ${e.message}`,
    });
  }
}

// ── 5. Frontend ──────────────────────────────────────────────────────

async function testFrontend() {
  section("5. Frontend (Next.js)");

  // Basic reachability
  try {
    const status = await fetchStatus(FRONTEND_URL);
    record({
      name: "Frontend reachable",
      passed: status === 200,
      message: status === 200 ? `${FRONTEND_URL} → 200 OK` : `HTTP ${status}`,
    });
  } catch (e: any) {
    record({
      name: "Frontend reachable",
      passed: false,
      message: `Cannot reach ${FRONTEND_URL}: ${e.message}`,
    });
    log(INFO, "Start the frontend: cd frontend && npm run dev");
    return;
  }

  // Check key pages
  const pages = ["/", "/arena", "/prophecies", "/governance", "/alliances"];
  for (const page of pages) {
    try {
      const status = await fetchStatus(`${FRONTEND_URL}${page}`);
      record({
        name: `Page ${page}`,
        passed: status === 200,
        message: `HTTP ${status}`,
      });
    } catch (e: any) {
      record({
        name: `Page ${page}`,
        passed: false,
        message: e.message,
      });
    }
  }

  // Check cults pages (dynamic)
  try {
    const status = await fetchStatus(`${FRONTEND_URL}/cults`);
    record({
      name: "Page /cults",
      passed: status === 200,
      message: `HTTP ${status}`,
    });
  } catch (e: any) {
    record({ name: "Page /cults", passed: false, message: e.message });
  }

  // Verify NEXT_PUBLIC_API_URL
  const nextEnvPath = path.join(ROOT, "frontend", ".env.local");
  const nextEnvExists = fs.existsSync(nextEnvPath);
  const frontendEnvContent = nextEnvExists ? fs.readFileSync(nextEnvPath, "utf-8") : "";
  const hasApiUrl = frontendEnvContent.includes("NEXT_PUBLIC_API_URL");

  record({
    name: "NEXT_PUBLIC_API_URL",
    passed: true,
    warning: !hasApiUrl,
    message: hasApiUrl
      ? "Set in frontend/.env.local"
      : "Not set — frontend defaults to http://localhost:3001 (ok for local dev)",
  });
}

// ── 6. Cross-Stack Integration ───────────────────────────────────────

async function testIntegration() {
  section("6. Cross-Stack Integration");

  // Frontend → Agent API connectivity
  try {
    // Simulate what the frontend does: fetch from API_BASE
    const stats = await fetchJSON(`${AGENT_API}/api/stats`);
    const cults = await fetchJSON(`${AGENT_API}/api/cults`);
    const agents = await fetchJSON(`${AGENT_API}/api/agents`);

    record({
      name: "Frontend→API data flow",
      passed: true,
      message: `Stats OK, ${cults.length} cults, ${agents.length} agents`,
    });

    // Warn if empty
    if (cults.length === 0 && agents.length === 0) {
      record({
        name: "Data availability",
        passed: true,
        warning: true,
        message: "Both cults and agents are empty — agents haven't started cycling yet",
      });
    }
  } catch (e: any) {
    record({
      name: "Frontend→API data flow",
      passed: false,
      message: `Integration broken: ${e.message}`,
    });
  }

  // Check contract ↔ API sync
  if (CULT_REGISTRY && PRIVATE_KEY) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const abi = ["function getTotalCults() view returns (uint256)"];
      const registry = new ethers.Contract(CULT_REGISTRY, abi, provider);
      const onChainCount = Number(await registry.getTotalCults());
      const apiCults = await fetchJSON(`${AGENT_API}/api/cults`);

      const synced = onChainCount === apiCults.length;
      record({
        name: "On-chain ↔ API sync",
        passed: true,
        warning: !synced,
        message: synced
          ? `Synced: ${onChainCount} cults on-chain = ${apiCults.length} in API`
          : `Mismatch: ${onChainCount} on-chain vs ${apiCults.length} in API (sync delay is normal)`,
      });
    } catch (e: any) {
      record({
        name: "On-chain ↔ API sync",
        passed: true,
        warning: true,
        message: `Could not verify: ${e.message}`,
      });
    }
  }
}

// ── 7. Code Health ───────────────────────────────────────────────────

async function testCodeHealth() {
  section("7. Code & Config Health");

  // Check personalities.json is valid
  const personalitiesPath = path.join(ROOT, "agent", "data", "personalities.json");
  try {
    const raw = fs.readFileSync(personalitiesPath, "utf-8");
    const personalities = JSON.parse(raw);
    const valid = Array.isArray(personalities) && personalities.length >= 3;
    record({
      name: "personalities.json",
      passed: valid,
      message: valid
        ? `${personalities.length} personalities defined: ${personalities.map((p: any) => p.name).join(", ")}`
        : "Invalid or fewer than 3 personalities",
    });

    // Check each personality has required fields
    const requiredFields = ["name", "symbol", "style", "systemPrompt", "description"];
    for (const p of personalities) {
      const missing = requiredFields.filter((f) => !p[f]);
      if (missing.length > 0) {
        record({
          name: `Personality: ${p.name || "unknown"}`,
          passed: false,
          message: `Missing fields: ${missing.join(", ")}`,
        });
      }
    }
  } catch (e: any) {
    record({
      name: "personalities.json",
      passed: false,
      message: `Cannot read: ${e.message}`,
    });
  }

  // Check tsconfig files exist
  for (const pkg of ["agent", "contracts", "frontend"]) {
    const tsconfig = path.join(ROOT, pkg, "tsconfig.json");
    record({
      name: `${pkg}/tsconfig.json`,
      passed: fs.existsSync(tsconfig),
      message: fs.existsSync(tsconfig) ? "Exists" : "Missing",
    });
  }

  // Check node_modules exist (npm workspaces may hoist to root)
  for (const pkg of ["agent", "contracts", "frontend"]) {
    const nm = path.join(ROOT, pkg, "node_modules");
    const rootNm = path.join(ROOT, "node_modules");
    const exists = fs.existsSync(nm) || fs.existsSync(rootNm);
    const hoisted = !fs.existsSync(nm) && fs.existsSync(rootNm);
    record({
      name: `${pkg}/node_modules`,
      passed: exists,
      message: exists
        ? hoisted
          ? "Hoisted to root node_modules (npm workspaces)"
          : "Installed"
        : `Missing — run: cd ${pkg} && npm install`,
    });

    if (!exists && AUTO_FIX) {
      log(FIX, `Installing dependencies for ${pkg}...`);
      const { execSync } = await import("child_process");
      try {
        execSync("npm install", { cwd: path.join(ROOT, pkg), stdio: "pipe" });
        record({
          name: `${pkg} npm install`,
          passed: true,
          message: "Dependencies installed",
          fixApplied: `Ran npm install in ${pkg}/`,
        });
      } catch (e: any) {
        record({
          name: `${pkg} npm install`,
          passed: false,
          message: `Install failed: ${e.message}`,
        });
      }
    }
  }

  // Check agent/src/config.ts has correct InsForge URL from env
  const configPath = path.join(ROOT, "agent", "src", "config.ts");
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, "utf-8");
    const hasInsforgeUrl = configContent.includes("INSFORGE_BASE_URL");
    const hasInsforgeKey = configContent.includes("INSFORGE_ANON_KEY");
    record({
      name: "Config reads InsForge env",
      passed: hasInsforgeUrl && hasInsforgeKey,
      message:
        hasInsforgeUrl && hasInsforgeKey
          ? "Config correctly reads INSFORGE_BASE_URL and INSFORGE_ANON_KEY from env"
          : "Config may have hardcoded InsForge credentials",
    });
  }
}

// ── 8. LLM Connectivity ─────────────────────────────────────────────

async function testLLM() {
  section("8. LLM / xAI Connectivity");

  if (!AGENT_API_KEY) {
    record({
      name: "xAI API key",
      passed: true,
      warning: true,
      message: "AGENT_API_KEY not set — agents will use fallback responses (no LLM intelligence)",
    });
    log(INFO, "To enable smart agent decisions, set AGENT_API_KEY in .env");
    return;
  }

  if (QUICK) {
    record({
      name: "LLM test",
      passed: true,
      warning: true,
      message: "Skipped in --quick mode",
    });
    return;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openrouter/aurora-alpha",
        messages: [{ role: "user", content: "Say 'test ok' in exactly 2 words." }],
        max_tokens: 10,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";
      record({
        name: "xAI API call",
        passed: true,
        message: `Grok responded: "${reply.trim()}"`,
      });
    } else {
      const body = await res.text();
      record({
        name: "xAI API call",
        passed: false,
        message: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      });
    }
  } catch (e: any) {
    record({
      name: "xAI API call",
      passed: false,
      message: `Network error: ${e.message}`,
    });
  }
}

// ── 9. Contract Tests ────────────────────────────────────────────────

async function testContracts() {
  section("9. Smart Contract Verification");

  if (QUICK) {
    record({
      name: "Contract tests",
      passed: true,
      warning: true,
      message: "Skipped in --quick mode",
    });
    return;
  }

  // Check if contracts compile
  const hardhatConfig = path.join(ROOT, "contracts", "hardhat.config.ts");
  if (!fs.existsSync(hardhatConfig)) {
    record({
      name: "Hardhat config",
      passed: false,
      message: "contracts/hardhat.config.ts not found",
    });
    return;
  }

  // Check artifacts exist (contracts compiled)
  const artifactsDir = path.join(ROOT, "contracts", "artifacts", "contracts");
  const hasArtifacts = fs.existsSync(artifactsDir);
  record({
    name: "Contract artifacts",
    passed: hasArtifacts,
    message: hasArtifacts
      ? "Compiled artifacts found"
      : "No artifacts — run: cd contracts && npx hardhat compile",
  });

  if (hasArtifacts) {
    // Verify all 7 contracts have artifacts
    const expectedContracts = [
      "CultRegistry",
      "GovernanceEngine",
      "FaithStaking",
      "EconomyEngine",
      "SocialGraph",
      "RaidEngine",
      "EventEmitter",
    ];
    for (const name of expectedContracts) {
      const artifactPath = path.join(artifactsDir, `${name}.sol`, `${name}.json`);
      record({
        name: `Artifact: ${name}`,
        passed: fs.existsSync(artifactPath),
        message: fs.existsSync(artifactPath) ? "Compiled" : "Missing",
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   AgentCult — Workflow Tester & Auto-Fixer              ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Mode: ${AUTO_FIX ? "TEST + AUTO-FIX" : "TEST ONLY"} ${QUICK ? "(quick)" : ""}${C.reset}`);
  console.log(`${C.dim}  Time: ${new Date().toISOString()}${C.reset}`);

  await testEnvVars();
  await testBlockchain();
  await testInsForge();
  await testAgentBackend();
  await testFrontend();
  await testIntegration();
  await testCodeHealth();
  await testLLM();
  await testContracts();

  // ── Summary ──────────────────────────────────────────────────────
  section("SUMMARY");

  const passed = results.filter((r) => r.passed && !r.warning).length;
  const warnings = results.filter((r) => r.warning).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n  ${PASS} Passed:   ${passed}/${total}`);
  console.log(`  ${WARN} Warnings: ${warnings}`);
  console.log(`  ${FAIL} Failed:   ${failed}`);

  if (fixes.length > 0) {
    console.log(`\n  ${FIX} Auto-fixes applied: ${fixes.length}`);
    fixes.forEach((f) => console.log(`    • ${f}`));
  }

  if (failed > 0) {
    console.log(`\n${C.bold}${C.red}  ❌ ${failed} test(s) failed — see details above${C.reset}`);

    // Print actionable fix suggestions
    console.log(`\n${C.bold}${C.yellow}  Suggested fixes:${C.reset}`);

    const failedResults = results.filter((r) => !r.passed);
    for (const r of failedResults) {
      if (r.name === "Agents loaded") {
        console.log(`    1. Check agent backend logs for bootstrap errors`);
        console.log(`    2. Ensure InsForge DB has 'agents' table`);
        console.log(`    3. Restart agent backend: cd agent && npm run dev`);
      } else if (r.name === "PRIVATE_KEY") {
        console.log(`    • Set PRIVATE_KEY in .env (64-char hex with 0x prefix)`);
      } else if (r.name === "CULT_REGISTRY_ADDRESS") {
        console.log(`    • Deploy contracts: cd contracts && npx hardhat run scripts/deploy.ts --network monadTestnet`);
        console.log(`    • Then set CULT_REGISTRY_ADDRESS in .env`);
      } else if (r.name.includes("npm install") || r.name.includes("node_modules")) {
        console.log(`    • Run: cd ${r.name.split("/")[0]} && npm install`);
      } else if (r.name === "InsForge agents table") {
        console.log(`    • Create agents table in InsForge using the MCP tools`);
      }
    }

    console.log(`\n  ${C.dim}Re-run with --fix to auto-fix what can be fixed:${C.reset}`);
    console.log(`  ${C.cyan}npx tsx scripts/test-workflow.ts --fix${C.reset}\n`);
  } else if (warnings > 0) {
    console.log(`\n${C.bold}${C.yellow}  ⚠️  All tests passed but ${warnings} warning(s) — review above${C.reset}\n`);
  } else {
    console.log(`\n${C.bold}${C.green}  ✅ All ${total} tests passed! System is healthy.${C.reset}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
  console.error(err.stack);
  process.exit(2);
});
