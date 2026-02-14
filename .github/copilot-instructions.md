## AgentCult — Copilot Instructions

AgentCult is an autonomous AI cult-warfare simulator on Monad blockchain.
Three AI agents run perpetual observe→think→act→evolve loops, competing for
treasury and followers via prophecies, raids, and governance.

### Monorepo Layout

```
contracts/   — Solidity 0.8.24 + Hardhat (Monad EVM, chain 10143)
agent/       — TypeScript ESM backend (tsx runner, Express API on :3001)
frontend/    — Next.js 16 + React 19 + Tailwind v4 (dark occult theme)
scripts/     — Workflow automation (test-workflow.ts)
```

Root `package.json` uses **npm workspaces**. Dependencies may be hoisted to
root `node_modules/`. Install: `cd {package} && npm i` or `npm i` at root.

### Critical Developer Workflows

```bash
# FIRST: Set up environment
cp .env.example .env
# Edit .env with PRIVATE_KEY, CULT_REGISTRY_ADDRESS, INSFORGE_ANON_KEY (JWT, not ik_*)

# Test full stack workflow
npx tsx scripts/test-workflow.ts          # comprehensive health check
npx tsx scripts/test-workflow.ts --quick  # skip slow tests
npx tsx scripts/test-workflow.ts --fix    # auto-fix missing deps

# Deploy contracts (run ONCE per testnet)
cd contracts && npx hardhat compile
npx hardhat run scripts/deploy.ts --network monadTestnet
# Copy CultRegistry address → .env CULT_REGISTRY_ADDRESS

# Start all services (separate terminals)
cd agent && npm run dev        # Agent backend (:3001)
cd frontend && npm run dev     # Next.js frontend (:3000)

# Root shortcuts
npm run contracts:test         # Run Hardhat tests
npm run agent:dev              # Start agent backend
npm run frontend:dev           # Start frontend
```

**Bootstrap sequence**: When agent backend starts for the first time, it:
1. Checks InsForge DB for existing agents
2. If empty, seeds 3 agents from `agent/data/personalities.json`
3. Each agent creates on-chain cult via `CultRegistry.registerCult()`
4. Agents begin 30-60s autonomous tick loops

### Architecture & Data Flow

```
Frontend (Next.js) ──5s polling──▶ Agent API (Express :3001)
                                        │
                                  AgentOrchestrator
                                  ┌──────┼──────┐
                               Agent1  Agent2  Agent3  (each with own wallet)
                                  └──────┼──────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                  LLMService      ContractService       InsForgeService
                  (Grok/xAI)       (ethers.js)          (persistence)
                                         │
                                   Monad Blockchain
                              CultRegistry.sol + nad.fun
```

**Key components**:
- **`AgentOrchestrator`** (`agent/src/core/AgentOrchestrator.ts`):
  Singleton orchestrator. Bootstraps shared services, creates `CultAgent`
  instances, syncs state to API `stateStore` every 3s. On first run seeds
  from `agent/data/personalities.json`; subsequent runs restore from InsForge.
  Each agent gets its own LLM instance + wallet + ContractService.

- **`CultAgent`** (`agent/src/core/CultAgent.ts`): 30–60s autonomous loop.
  Each cycle: (1) fetch on-chain state, (2) LLM decides action, (3) execute,
  (4) resolve old prophecies, (5) persist to InsForge. Actions: prophecy,
  recruit, raid, govern, ally, betray, coup, leak, meme, bribe.

- **`TransactionQueue`** (`agent/src/chain/TransactionQueue.ts`): Per-agent
  TX serializer with 3-retry exponential backoff. Prevents nonce collisions.

- **`MemoryService`** (`agent/src/services/MemoryService.ts`): Persistent
  episodic memory. Tracks raid outcomes, trust scores (-1.0 to 1.0), win/loss
  streaks. Backed by InsForge tables: `agent_memories`, `trust_records`,
  `streaks`. LLM receives `MemorySnapshot` for context-aware decisions.

- **`InsForgeService`** (`agent/src/services/InsForgeService.ts`): Single
  `@insforge/sdk` client, functional exports (no class). 17 DB tables:
  `agents`, `agent_memories`, `trust_records`, `streaks`, `prophecies`,
  `raids`, `alliances`, `betrayals`, `governance_proposals`, `budgets`,
  `evolution_traits`, `llm_decisions`, `agent_messages`, `memes`,
  `token_transfers`, `spoils_votes`, `defection_events`. All ops return
  `{data, error}`. Client created via `getInsForgeClient()` singleton.

- **Frontend**: No global state. Each component uses `usePolling(fetcher, 5000)`
  hook to poll Express API. SSE endpoint at `/api/events` for real-time
  (event-stream). API routes in `agent/src/api/routes/` sync from `stateStore`.

### Agent Backend Conventions

**ESM imports**: Always `.js` extensions in imports:
```typescript
import { config } from "../config.js"  // NOT "../config"
```
Reason: `tsconfig` uses `"module": "ESNext"` + `"moduleResolution": "bundler"`.

**Contract ABIs**: Inline human-readable strings in `agent/src/config.ts`:
```typescript
export const CULT_REGISTRY_ABI = [
  "function registerCult(string name, string prophecyPrompt, address tokenAddress) payable returns (uint256)",
  // ...
] as const;
```
Never import from `contracts/artifacts/` — keeps agent runtime lightweight.

**Service injection**: All services instantiated in `AgentOrchestrator.bootstrap()`,
passed to `CultAgent` via constructor. Per-agent services (LLM, ContractService)
get agent's own wallet/API key. Shared services (MemoryService, RaidService)
are singleton instances.

**Logger pattern**:
```typescript
import { createLogger } from "../utils/logger.js";
const log = createLogger("ModuleName");
log.info("message"), log.warn(), log.error()
```
Enable debug: `DEBUG=1` env var. Outputs `[ISO] [LEVEL] [Module] msg`.

**LLM resilience**: Every LLM call has try/catch with fallback response.
Agents must never crash on API failure. Example:
```typescript
try {
  const decision = await this.llm.decideAction(...);
} catch (error) {
  return { action: "idle", reason: "LLM unavailable" };
}
```
LLM uses OpenAI SDK → `api.x.ai/v1` with model `grok-3-fast`. Fallback
responses ensure agents always progress.

**Per-agent wallets**: Each agent row in InsForge DB has `wallet_address` +
`wallet_private_key` (generated on creation). `ContractService` constructor
accepts optional `privateKey` — each agent gets its own instance.

**State persistence**: After every agent tick, `updateAgentState(agentDbId, {...})`
persists to InsForge (fire-and-forget). No await — non-blocking. Enables
crash recovery.

### Smart Contracts

Seven contracts in `contracts/contracts/` — **no OpenZeppelin**, hand-rolled
access control + custom economics:

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `CultRegistry.sol` | Core state | `registerCult()`, `depositToTreasury()`, `joinCult()`, `recordRaid()`, `createProphecy()` |
| `GovernanceEngine.sol` | Budget proposals + voting | `createProposal()`, `castVote()`, `executeProposal()`, `proposeCoup()` |
| `FaithStaking.sol` | Stake MON for faith points | `stake()`, `unstake()`, `claimYield()` |
| `EconomyEngine.sol` | Token economics | Revenue distribution, burn mechanics |
| `SocialGraph.sol` | On-chain trust tracking | Alliance formation (off-chain only for MVP) |
| `RaidEngine.sol` | Raid resolution | Combat logic, spoils votes (off-chain for MVP) |
| `EventEmitter.sol` | Cross-contract events | Event hub for frontend indexing |

**Test pattern**: Hardhat + ethers + chai. Each test file has nested `describe`
blocks per feature. Use `loadFixture` for fresh contract deploys per test.
TypeChain generates typed contract wrappers in `contracts/typechain-types/`.

```typescript
describe("CultRegistry", () => {
  describe("registerCult", () => {
    it("should create cult with initial treasury", async () => {
      const { registry, wallet } = await loadFixture(deployFixture);
      const tx = await registry.registerCult("Cult Name", "prompt", ethers.ZeroAddress, { value: ethers.parseEther("0.01") });
      // ...
    });
  });
});
```

### Frontend Conventions

**App Router**: All pages in `frontend/src/app/`. Use `"use client"` directive
for components with hooks. Path alias `@/` → `src/`.

**No barrel exports**: Import directly from component files:
```typescript
import { Navbar } from "@/components/Navbar"  // NOT from index.ts
```

**API layer**: `src/lib/api.ts` exports `api` object with typed methods:
```typescript
export const api = {
  getStats: () => fetchJSON<Stats>("/api/stats"),
  getCults: () => fetchJSON<Cult[]>("/api/cults"),
  // ... all types co-located in same file
}
```
Read-only — no mutations. All writes go through agent backend.

**Polling hook**: `src/hooks/usePolling.ts` — generic `<T>(fetcher, interval)`:
```typescript
const { data: stats } = usePolling<Stats>(
  useCallback(() => api.getStats(), []),  // wrap in useCallback!
  5000  // 5s poll interval
);
```
**Critical**: Wrap fetcher in `useCallback` to prevent infinite re-renders.

**Theme**: Dark occult aesthetic. Base: `bg-[#0a0a0a]`, `className="dark"` on
`<html>`. Cult colors (gradient accents):
```typescript
export const CULT_COLORS: Record<number, string> = {
  0: "#7c3aed",  // Purple — Church of Eternal Candle
  1: "#dc2626",  // Red — Order of Red Dildo
  2: "#f59e0b",  // Gold — Temple of Diamond Hands
};
```
See `src/lib/constants.ts` for full color + icon mappings.

### Environment Variables

Root `.env` (read by `agent/src/config.ts` via `dotenv`):

**Required**:
- `PRIVATE_KEY` — Agent deployer wallet (0x... 64-char hex)
- `CULT_REGISTRY_ADDRESS` — Deployed CultRegistry contract
- `INSFORGE_ANON_KEY` — **JWT token** (not `ik_*` admin key). Get via
  `mcp_insforge_get-anon-key` MCP tool or InsForge console.

**Optional**:
- `XAI_API_KEY` — Grok LLM key (agents use fallback responses if missing)
- `GOVERNANCE_ENGINE_ADDRESS`, `CULT_TOKEN_ADDRESS` — Other contracts
- `INSFORGE_BASE_URL` — Default: `https://3wcyg4ax.us-east.insforge.app`

**Frontend**: Prefix with `NEXT_PUBLIC_` for client-side:
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001  # Agent API endpoint
```

### Debugging & Troubleshooting

**Agent backend not loading agents?**
1. Check InsForge DB has 17 tables (run `scripts/test-workflow.ts`)
2. Verify `INSFORGE_ANON_KEY` is JWT (starts with `eyJ...`), not admin key
3. Restart backend: `cd agent && npm run dev`
4. Check logs for bootstrap errors

**Contract calls failing?**
- Verify wallet has MON balance (check in `test-workflow.ts` output)
- Confirm `CULT_REGISTRY_ADDRESS` is correct deployed contract
- Check Monad RPC: `https://testnet-rpc.monad.xyz` (chain 10143)

**Frontend showing 0 cults?**
- Backend must run at least 1 agent tick cycle (30-60s)
- Check `/api/health` shows `agents > 0`
- Verify on-chain: `CultRegistry.getTotalCults()` via Hardhat console

**Test all systems**:
```bash
npx tsx scripts/test-workflow.ts  # 69 checks across 9 categories
```
