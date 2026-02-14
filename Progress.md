# AgentCult: Progress & Implementation Tracker

> **Last Updated**: February 14, 2026 (post Batches 1-7 — Final gap closure)
> **Status**: ~100% complete — All core + design doc systems implemented
> **Deadline**: February 15, 2026 23:59 ET (target demo: Feb 14)

---

## High-Level Plan

**AgentCult: Emergent Religious Economies** — Autonomous AI cult leaders recruit followers via prophecies and bribes, build $CULT token treasuries, then raid and sacrifice rival cults' funds. All on Monad blockchain.

### Target Bounties

| Track                    | Prize                                           | Requirements                                              |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| **Agent+Token**          | $10K/winner (10 winners) + $40K liquidity boost | Deploy token on nad.fun + agent interacts with token      |
| **Religious Persuasion** | $10K                                            | AI prophets generating predictions & converting followers |
| **Gaming Arena**         | $10K                                            | Raid mechanics with treasury wagering & leaderboards      |

### Architecture

```
Frontend (Next.js 16 + Tailwind) ──REST/SSE──▶ Agent API (Express :3001)
                                                    │
                                              AgentOrchestrator
                                              ┌─────┼─────┐
                                           Agent1 Agent2 Agent3
                                              └─────┼─────┘
                                                    │
                                     ┌──────────────┼──────────────┐
                                  LLMService    ContractService  MarketService
                                  (Grok/xAI)   (ethers.js)      (CoinGecko)
                                                    │
                                              Monad Blockchain
                                         CultRegistry.sol + nad.fun
```

---

## Implementation Status vs System Design

### ✅ COMPLETED

#### Smart Contracts (7/7 — all designed contracts built)

- [x] **CultRegistry.sol** (~350 lines) — Cult registration, treasury management, follower tracking, raid recording, prophecy creation/resolution, leaderboard queries, **agent identity system** (register/deactivate/reputation), **anti-sybil minimum stake**, **on-chain defection recording** (recordDefection with DefectionRecord struct)
- [x] **FaithStaking.sol** (~170 lines) — Stake MON for faith points, time-weighted rewards, 1% raid fee distribution to winning cult stakers
- [x] **GovernanceEngine.sol** (~730 lines) — Democratic budget proposals (Raid/Growth/Defense/Reserve %), weighted voting, execution, **bribery system** (offer/accept/reveal), **leadership elections** (propose/vote/execute), **2x leader vote weight**, **coup system** (proposeCoup with power-based threshold), **commit-reveal voting** (commitVote/revealVote anti-front-running)
- [x] **EconomyEngine.sol** (~330 lines) — Treasury snapshots, protocol fees, tick burns, death spiral, rebirth, **selective balance visibility**, **fund locking/releasing** for escrow, **typed inter-cult transfers**
- [x] **SocialGraph.sol** (~450 lines) — Alliance formation, betrayal, trust scoring, **membership approval/expulsion**, **secret alliances** with visibility gating
- [x] **RaidEngine.sol** (~545 lines) — On-chain raid resolution, power formula (Treasury×0.6 + Members×100×0.4), ±20% variance, 5% home advantage, 70/20/10 spoils, 2-min cooldowns, **spoils distribution voting** (create/cast/resolve), **alliance joint raids** (JointRaidParams struct, combined power, proportional spoils split)
- [x] **EventEmitter.sol** (~155 lines) — Unified on-chain event log, 6 categories (RAID/GOVERNANCE/ECONOMY/SOCIAL/AGENT/SYSTEM), single + batch emission, per-cult/per-category counters
- [x] **Deploy script** — `scripts/deploy.ts` deploys all 7 contracts: CultRegistry → FaithStaking → GovernanceEngine → SocialGraph → EconomyEngine → RaidEngine → EventEmitter
- [x] **Hardhat config** — Monad testnet (chain 10143) + mainnet (chain 143) configured
- [x] **Tests** — 89 tests across 7 files, all passing:
  - `CultRegistry.test.ts` — 17 tests (registration, followers, raids, prophecies, agent identity, anti-sybil)
  - `EconomyEngine.test.ts` — 20 tests (treasury, fees, burns, rebirth, visibility, fund locking, transfers)
  - `GovernanceEngine.test.ts` — 19 tests (proposals, voting, execution, bribery, leadership, vote weight)
  - `SocialGraph.test.ts` — 15 tests (alliances, betrayal, trust, membership, secret alliances)
  - `RaidEngine.test.ts` — 17 tests (raid resolution, cooldowns, spoils, power calc, admin)
  - `EventEmitter.test.ts` — 6 tests (event emission, counting, batch, access control)
  - `FaithStaking.test.ts` — (existing)


#### Agent Backend — Core (Node.js/TypeScript)

- [x] **CultAgent.ts** (~570 lines) — Full autonomous loop: observe→think→act→evolve with 30-60s cycles, all on-chain writes use TransactionQueue, **coup execution**, **leak execution**, **joint raid coordination with allies**, **spoils vote creation for winning raids**
- [x] **AgentOrchestrator.ts** (~257 lines) — Manages 3 concurrent agents, staggered start, $CULT token creation via nad.fun on bootstrap, state sync to API
- [x] **AgentPersonality.ts** — Loads 3 cult personalities from JSON
- [x] **ContractService.ts** (~230 lines) — Full ethers.js wrapper for CultRegistry (register, deposit, joinCult, raid, prophecy, resolve, **recordDefection**)
- [x] **NadFunService.ts** (~156 lines) — Creates $CULT token on nad.fun bonding curve via on-chain tx, queries token progress/graduation, market data via REST
- [x] **TransactionQueue.ts** — Serial transaction queue with retry logic (3 attempts, exponential backoff), per-agent instances
- [x] **LLMService.ts** (~152 lines) — Grok/xAI via OpenAI SDK with `generateProphecy()`, `decideAction()`, `generateScripture()` + fallback responses on failure. **9 action types** (prophecy, recruit, raid, govern, ally, betray, coup, leak, idle)
- [x] **MarketService.ts** (~70 lines) — CoinGecko price feed with caching + simulated fallback
- [x] **Config** — All env vars with sensible defaults, inline human-readable ABIs for CultRegistry + GovernanceEngine
- [x] **Logger + sleep utils**

#### Agent Backend — Services (Design Doc §3.1–3.9)

- [x] **ProphecyService.ts** — In-memory prophecy store, generation via LLM, real market-based resolution (bullish/bearish prediction vs ETH price movement)
- [x] **RaidService.ts** (~220 lines) — Power formula `Treasury×0.6 + Members×100×0.4`, ±20% random variance, +5% defender home advantage, 2-min cooldown per pair, **spoils distribution voting** (create/cast/resolve), **joint raid resolution** with proportional spoils split
- [x] **PersuasionService.ts** (~112 lines) — LLM scripture generation + on-chain `joinCult()` recording, **design doc formula**: `scriptureQuality × cultPower × charismaFactor / resistance` (replaces random 1-3)
- [x] **GovernanceService.ts** (~390 lines) — LLM-driven budget proposals, on-chain voting via GovernanceEngine with off-chain fallback, proposal resolution + budget tracking, **coup system** (attemptCoup with power threshold + cooldown tracking)
- [x] **LifeDeathService.ts** (~146 lines) — Death triggers (treasury depleted + follower threshold), 5-min rebirth cooldown, death/rebirth event tracking
- [x] **MemoryService.ts** (~311 lines) — Episodic memory (capped at 100), trust graph via EMA (decay 0.95, impact 0.15), win/loss streak tracking, LLM context generation
- [x] **AllianceService.ts** (~370 lines) — Alliance formation/betrayal, trust-driven `shouldFormAlliance()` and `shouldBetray()` with probabilistic thresholds, expiry cleanup, **canJointRaid()** validation, **getJointRaidPowerBonus()** calculation
- [x] **DefectionService.ts** (~190 lines) — Probabilistic defection model factoring power ratio, streak history, trust scores, **on-chain recording** via ContractService.recordDefection()
- [x] **CommunicationService.ts** (~370 lines) — LLM-generated inter-agent messaging (taunts, laments, propaganda), SSE broadcast, **whisper channels** (private 1:1), **propaganda blitz** (multi-target), **leakConversation()** (expose private whispers publicly), **selectiveDisclose()** (targeted intel sharing)
- [x] **EvolutionService.ts** (~331 lines) — Personality mutation engine: aggression/confidence/diplomacy traits evolve from streaks + trust + prophecy accuracy, modifies system prompt dynamically, **belief dynamics** (zealotry, mysticism, pragmatism, adaptability)

#### Agent Backend — API (8 route files, all real)

- [x] **Express API server** — Health, stats, cults, prophecies, raids, agents (with working deploy endpoint), SSE endpoints
- [x] **Route: agents** — GET list, GET by ID, POST deploy (creates agent + broadcasts SSE)
- [x] **Route: cults** — GET list, GET by ID, GET stats, GET leaderboard, GET cults with agents
- [x] **Route: prophecies** — GET list, GET by cult, sorted/filtered by resolved status
- [x] **Route: raids** — GET list, GET by cult, GET stats, GET recent
- [x] **Route: governance** — GET proposals, GET budgets, GET by cult, GET active proposals
- [x] **Route: alliances** — GET alliances, GET active, GET betrayals, GET defections, GET evolution traits
- [x] **Route: communication** — GET messages, GET by cult, GET evolution traits
- [x] **Route: sse** — Server-Sent Events with proper headers, client tracking, disconnect cleanup
- [x] **State sync** — Orchestrator state → API stateStore every 3 seconds with real confidence values

#### Frontend (Next.js 16 + Tailwind)

- [x] **Dashboard** (`/`) — Hero, StatsBar, top 3 CultCards, recent prophecies, recent raids, AgentDeployForm
- [x] **Leaderboard** (`/cults`) — Full table ranked by treasury with token address, followers, W/L
- [x] **Cult Detail** (`/cults/[id]`) — Stats, prophecy history, raid history
- [x] **Raid Arena** (`/arena`) — Animated VS battle visualization with auto-cycling, click-to-replay, scripture
- [x] **Governance** (`/governance`) — Budget proposals (Raid/Growth/Defense/Reserve), voting progress bars, time-ago display
- [x] **Prophecy Feed** (`/prophecies`) — Stats bar, scrolling feed with AWAITING/FULFILLED/FAILED badges
- [x] **Alliances** (`/alliances`) — Stats cards, active alliances with countdown timers, betrayal/defection history
- [x] **Navbar** — Sticky, active state, Monad testnet status badge, wallet connect button
- [x] **WalletButton** — Connect MetaMask, auto-switch to Monad testnet (chain 10143), account/chain change listeners
- [x] **AgentDeployForm** — Deploy new cult agents from the dashboard, wired to working API endpoint
- [x] **StakingPanel** — **Real wallet integration** (MetaMask → FaithStaking contract), faith points tracking, pool stats display, transaction hash links, Monad explorer integration, simulated fallback when no wallet
- [x] **TreasuryChart** — Bar chart metrics + **time-series line chart** (60-snapshot rolling window), trend indicators (▲/▼), mode switching (treasury/followers/power), SVG mini-charts with gradient fill
- [x] **Dark occult theme** — Purple/red/gold glow effects, animations, scrollbar styling
- [x] **usePolling hook** — Generic 5s polling for all data
- [x] **useWallet hook** — EIP-1193 wallet connection with Monad testnet auto-switch
- [x] **API client** — Type-safe fetch wrapper with all endpoints
- [x] **Constants** — `API_BASE`, `MONAD_CHAIN_ID`, `CULT_COLORS`, `CULT_ICONS` maps

#### Infrastructure

- [x] **Monorepo** — npm workspaces (contracts, agent, frontend)
- [x] **Git** — Initialized, committed
- [x] **README.md** — Comprehensive docs with architecture, setup, API reference
- [x] **.env.example** — All required env vars documented
- [x] **.gitignore** — node_modules, .env, artifacts, .next, etc.

### 3 Pre-built Cult Personalities

| Cult                         | Icon | Strategy                                      |
| ---------------------------- | ---- | --------------------------------------------- |
| Church of the Eternal Candle | 🕯️   | Mystical market prophet, bold predictions     |
| Order of the Red Dildo       | 🔴   | Aggressive degen evangelist, frequent raids   |
| Temple of Diamond Hands      | 💎   | Stoic hodl philosopher, conservative treasury |

---

### ✅ vs System Design — Feature Coverage

Mapping implemented features against the System Design Document (§1–§16):

| Design Doc Module | Section | Impl Status | Notes |
| --- | --- | --- | --- |
| **Agent Registry** | §3.1 | ✅ Full | CultRegistry.sol + ContractService.ts. Agent lifecycle via LifeDeathService. |
| **Social Graph** | §3.2 | ✅ Full | SocialGraph.sol (on-chain alliances, trust, betrayal) + AllianceService.ts (off-chain logic, joint raid validation) |
| **Governance** | §3.3 | ✅ Full | GovernanceEngine.sol + GovernanceService.ts. Budget proposals + voting + **coups** + **commit-reveal** implemented. |
| **Economy** | §3.4 | ✅ Full | EconomyEngine.sol (fees, tick burns, death spiral, rebirth). Treasury in CultRegistry. |
| **Raid Engine** | §3.5 | ✅ Full | RaidService.ts implements design doc power formula. On-chain recording via CultRegistry. **Joint raids** + **spoils voting** added. |
| **Trading Engine** | §3.6 | ❌ Skip | Design doc marked as "Optional Secondary Mechanic". Not implemented — raids are primary. |
| **Communication** | §3.7 | ✅ Full | CommunicationService.ts (LLM messaging, SSE broadcast, **whisper**, **propaganda blitz**, **leaking**, **selective disclosure**). |
| **Life & Death** | §3.8 | ✅ Full | LifeDeathService.ts (death triggers, rebirth cooldown). EconomyEngine death spiral. |
| **Event Stream** | §3.9 | ✅ Full | SSE endpoint, `broadcastEvent()`, stateStore sync every 3s. |
| **Agent Brain** | §4.1 | ✅ Full | CultAgent observe→think→act→evolve loop, 30-60s cycles. **9 action types** including coup & leak. |
| **Perception** | §4.2 | ✅ Full | Fetches on-chain state + market data + memory context each cycle. |
| **Memory System** | §4.3 | ✅ Full | MemoryService.ts — trust graph (EMA), streaks, episodic memory, LLM context. |
| **LLM Decisions** | §4.4 | ✅ Full | LLMService.ts — JSON schema responses, **9 action types**, personality-injected prompts. |
| **Decision Factors** | §4.5 | ✅ Full | Context includes treasury, followers, rivals, market trend, memory — fed to LLM. |
| **Communication Types** | §5 | ✅ Full | Public + group + **private whisper** + **propaganda blitz** + **conversation leaking** + **selective disclosure**. |
| **Religious Systems** | §6 | ✅ Full | 3 pre-built ideologies + **runtime belief evolution** (zealotry, mysticism, pragmatism, adaptability) + **conversion formula**. |
| **Economic Model** | §7 | ✅ Full | $CULT token on nad.fun, cult treasuries, raid spoils, **spoils distribution voting**, **selective balance visibility**. |
| **Security/Trust** | §8 | ✅ Full | Trust graph in MemoryService, reputation via streaks, anti-sybil stake, **commit-reveal voting** (anti-front-running). |
| **Monad Optimizations** | §9 | ✅ Arch | Designed for Monad 10k TPS. Parallel agent execution. Sub-second finality. |

### ⚠️ REMAINING GAPS (vs System Design) — Updated Feb 14 post Batch 7 (Final)

| Feature (from Design Doc) | Section | Status | Notes |
| --- | --- | --- | --- |
| **Bribery mechanics** | §3.3 | ✅ Implemented | `offerBribe()`, `acceptBribe()`, `revealBribes()` in GovernanceEngine.sol with escrow |
| **Leadership voting / coups** | §3.3 | ✅ Implemented | Leadership elections + **`proposeCoup()`** — power-based threshold (1.5x leader power), cooldown, CoupAttempted event |
| **Vote weighting options** | §3.3 | ✅ Implemented | Leader 2x vote weight enforced on-chain via `getVoteWeight()` |
| **Trading Engine** | §3.6 | ❌ Skipped | Explicitly "optional" in design doc. Raids are sole wealth accumulation path |
| **Private encrypted messages** | §5.1 | ✅ Implemented | `whisper()` for private 1-on-1, `propagandaBlitz()` for multi-target, `getPrivateMessages()` |
| **Conversation reveal / leaking** | §5.3 | ✅ Implemented | **`leakConversation()`** exposes whispers publicly + **`selectiveDisclose()`** for targeted intel sharing. Agent "leak" action wired in CultAgent. |
| **Belief evolution at runtime** | §6.2 | ✅ Implemented | `evolveBeliefs()` in EvolutionService — zealotry, mysticism, pragmatism, adaptability |
| **Conversion attempts** | §6.2 | ✅ Implemented | Design doc formula: `scriptureQuality × cultPower × charismaFactor / resistance` |
| **Selective balance visibility** | §7.2 | ✅ Implemented | `grantBalanceView()`, `revokeBalanceView()`, `getVisibleBalance()` in EconomyEngine.sol |
| **Raid spoils distribution vote** | §7.5 | ✅ Implemented | **`createSpoilsVote()`**, **`castSpoilsVote()`**, **`resolveSpoilsVote()`** in RaidEngine.sol + RaidService.ts — 3 options: treasury/stakers/reinvest |
| **Member defection post-raid** | §3.5 | ✅ Implemented | DefectionService probability model + **on-chain `recordDefection()`** in CultRegistry.sol — decrements source/increments target, permanent DefectionRecord |
| **Alliance raid coordination** | §3.5 | ✅ Implemented | **`initiateJointRaid(JointRaidParams)`** in RaidEngine.sol — combined power, proportional spoils split. **`canJointRaid()`** + **`resolveJointRaid()`** in agent services. CultAgent auto-detects allies for joint raids. |
| **Agent reputation system** | §8.2 | ✅ Implemented | `registerAgent()`, `updateReputation()`, `deactivateAgent()` in CultRegistry.sol with `AgentIdentity` struct |
| **Anti-exploit mechanisms** | §8.3 | ✅ Implemented | `minimumStake` anti-sybil in CultRegistry + **commit-reveal voting** (`commitVote()`/`revealVote()`) in GovernanceEngine.sol — prevents front-running of votes |
| **FaithStaking frontend UI** | — | ✅ Implemented | **StakingPanel.tsx** with real MetaMask wallet integration, FaithStaking contract calls (stake/unstake), faith points, pool stats, tx hash links to Monad explorer |
| **TreasuryChart analytics** | — | ✅ Implemented | **TreasuryChart.tsx** with 60-snapshot time-series, SVG mini line chart, trend indicators (▲/▼), mode switcher (treasury/followers/power) |

> **Score: 15/16 gaps closed ✅ — Only Trading Engine deliberately skipped (design doc "optional")**

### 🎯 Stretch Goals (Not in System Design)

| Feature | Status | Notes |
| --- | --- | --- |
| **x402 bribe streaming** | ❌ Not impl | Stretch goal from hackathon ideation. |
| **Mobile push alerts** | ❌ Not impl | Stretch goal. |
| **Twitter/Discord integration** | ❌ Not impl | No social posting from agents. |
| **Pyth Network oracle** | ❌ Not impl | Prophecy resolution uses simulated market data, not real oracle. |

---

## Compilation & Build Status

| Package     | Status                       | Command                                                   |
| ----------- | ---------------------------- | --------------------------------------------------------- |
| `contracts` | ✅ Compiles, 89 tests pass   | `cd contracts && npx hardhat compile && npx hardhat test` |
| `agent`     | ✅ Zero TypeScript errors    | `cd agent && npx tsc --noEmit`                            |
| `frontend`  | ✅ Builds clean, 9/9 routes  | `cd frontend && npx next build`                           |

> All verified post Batch 7 (final gap closure). Contracts: 3 files recompiled. Agent: 0 errors. Frontend: 9/9 pages generated.

---

## Environment Requirements

```env
# .env (root)
PRIVATE_KEY=           # Deployer/agent wallet private key (without 0x)
MONAD_TESTNET_RPC=     # defaults to https://testnet-rpc.monad.xyz
XAI_API_KEY=           # Grok/xAI API key from console.x.ai
CULT_REGISTRY_ADDRESS= # Filled after: npx hardhat run scripts/deploy.ts --network monad_testnet
CULT_TOKEN_ADDRESS=    # Filled after nad.fun token creation (or auto-created by orchestrator)
FAITH_STAKING_ADDRESS= # Filled after deployment
AGENT_API_PORT=        # defaults to 3001

# Frontend
NEXT_PUBLIC_API_URL=   # defaults to http://localhost:3001
```

### Prerequisites

- Node.js 18+
- Monad testnet MON tokens from https://faucet.monad.xyz
- xAI API key from https://console.x.ai

---

## What To Do Next (Priority Order)

### 🔴 P0 — Must-do before submission (Feb 14)

1. **Deploy contracts to Monad testnet**

   ```bash
   # Fill .env with PRIVATE_KEY, get MON from faucet
   cd contracts && npx hardhat run scripts/deploy.ts --network monadTestnet
   # Deploys: CultRegistry → FaithStaking → GovernanceEngine → SocialGraph → EconomyEngine
   # Copy all 5 deployed addresses to .env
   ```

2. **Test end-to-end with real xAI API key**

   ```bash
   cd agent && npm run dev
   # Verify: agents register on-chain, prophecies recorded, raids resolved
   # $CULT token auto-created on nad.fun during bootstrap (if balance > 0.02 MON)
   ```

3. **Deploy frontend to Vercel**

   ```bash
   cd frontend && npx vercel --prod
   # Set NEXT_PUBLIC_API_URL env var to your agent API URL
   ```

4. **Record 3-minute demo video** — Show agents running, prophecies appearing, raid animation

### 🟡 P1 — High-impact polish (if time permits)

5. ~~**FaithStaking frontend UI**~~ ✅ Done — StakingPanel.tsx with real wallet integration
6. ~~**TreasuryChart component**~~ ✅ Done — Time-series line chart with 60-snapshot rolling window
7. ~~**Persuasion formula**~~ ✅ Done — Design doc formula replaces random conversion count

### 🟢 P2 — Stretch goals (post-hackathon)

8. ~~**Bribery mechanics**~~ ✅ Done
9. ~~**Leadership voting / coups**~~ ✅ Done — `proposeCoup()` with power threshold
10. ~~**Joint alliance raids**~~ ✅ Done — `initiateJointRaid()` with proportional spoils
11. ~~**Private encrypted messaging**~~ ✅ Done — whisper + propaganda blitz + **leaking** + **selective disclosure**
12. ~~**Selective balance visibility**~~ ✅ Done
13. ~~**Belief evolution**~~ ✅ Done — zealotry, mysticism, pragmatism, adaptability
14. **Pyth Network oracle** — Replace simulated prophecy resolution with real price oracle

---

## File Structure Reference

```
Moltiverse-cult/
├── package.json                    # Workspace root (npm workspaces)
├── .env.example
├── .gitignore
├── README.md
├── Progress.md                     # THIS FILE
├── AgentCult_System_Design.md      # Full system design (2858 lines)
├── contracts/
│   ├── package.json
│   ├── hardhat.config.ts          # Monad testnet (10143) + mainnet (143)
│   ├── tsconfig.json
│   ├── contracts/
│   │   ├── CultRegistry.sol       # ✅ Core: cults, treasury, raids, prophecies (215 lines)
│   │   ├── FaithStaking.sol       # ✅ Staking: faith points, raid rewards (~170 lines)
│   │   ├── GovernanceEngine.sol   # ✅ Governance: proposals, voting, budgets (~260 lines)
│   │   ├── EconomyEngine.sol      # ✅ Economy: fees, burns, death spiral (~265 lines)
│   │   └── SocialGraph.sol        # ✅ Social: alliances, trust, betrayal (~270 lines)
│   ├── scripts/
│   │   └── deploy.ts              # ✅ Deploys all 5 contracts in order
│   └── test/
│       ├── CultRegistry.test.ts   # ✅ 7 tests
│       ├── EconomyEngine.test.ts  # ✅ 12 tests
│       ├── GovernanceEngine.test.ts # ✅ 10 tests
│       └── SocialGraph.test.ts    # ✅ 9 tests
├── agent/
│   ├── package.json               # ESM ("type": "module"), tsx runner
│   ├── tsconfig.json              # module: ESNext, moduleResolution: bundler
│   ├── data/
│   │   └── personalities.json     # ✅ 3 cult personalities
│   └── src/
│       ├── index.ts               # ✅ Entrypoint + 3s state sync loop
│       ├── config.ts              # ✅ Config + inline ABI strings
│       ├── core/
│       │   ├── AgentOrchestrator.ts  # ✅ Bootstraps services, creates 3 agents (~257 lines)
│       │   ├── AgentPersonality.ts   # ✅ Loads personalities from JSON
│       │   └── CultAgent.ts         # ✅ Observe→think→act→evolve loop (~495 lines)
│       ├── services/
│       │   ├── LLMService.ts        # ✅ Grok/xAI via OpenAI SDK (~152 lines)
│       │   ├── MarketService.ts     # ✅ CoinGecko + fallback (~70 lines)
│       │   ├── ProphecyService.ts   # ✅ Market-based resolution
│       │   ├── RaidService.ts       # ✅ Power formula + cooldowns (~123 lines)
│       │   ├── PersuasionService.ts # ⚠️ LLM scripture, random conversion count (~91 lines)
│       │   ├── GovernanceService.ts # ✅ On-chain + off-chain fallback (~327 lines)
│       │   ├── LifeDeathService.ts  # ✅ Death/rebirth lifecycle (~146 lines)
│       │   ├── MemoryService.ts     # ✅ Trust graph, streaks, episodic memory (~311 lines)
│       │   ├── AllianceService.ts   # ✅ Formation, betrayal, trust logic (~339 lines)
│       │   ├── DefectionService.ts  # ✅ Probabilistic defection model (~156 lines)
│       │   ├── CommunicationService.ts # ✅ LLM messaging + SSE (~180 lines)
│       │   └── EvolutionService.ts  # ✅ Personality mutation engine (~226 lines)
│       ├── chain/
│       │   ├── ContractService.ts   # ✅ CultRegistry ethers.js wrapper (~207 lines)
│       │   ├── NadFunService.ts     # ✅ nad.fun token creation + REST (~156 lines)
│       │   └── TransactionQueue.ts  # ✅ Serial queue with 3x retry
│       ├── api/
│       │   ├── server.ts            # ✅ Express + stateStore + SSE broadcast
│       │   └── routes/
│       │       ├── agents.ts        # ✅ GET/POST with deploy endpoint
│       │       ├── cults.ts         # ✅ Leaderboard, stats, detail
│       │       ├── prophecies.ts    # ✅ Sorted, filtered by status
│       │       ├── raids.ts         # ✅ Stats, recent, by cult
│       │       ├── governance.ts    # ✅ Proposals, budgets, active
│       │       ├── alliances.ts     # ✅ Alliances, betrayals, defections
│       │       ├── communication.ts # ✅ Messages, evolution traits
│       │       └── sse.ts           # ✅ Server-Sent Events
│       └── utils/
│           ├── logger.ts            # ✅ createLogger("Tag")
│           └── sleep.ts             # ✅ sleep() + randomDelay()
└── frontend/
    ├── package.json                 # Next.js 16 + React 19 + Tailwind v4
    ├── next.config.ts
    └── src/
        ├── app/
        │   ├── globals.css          # ✅ Dark occult theme
        │   ├── layout.tsx           # ✅ Root layout + Navbar
        │   ├── page.tsx             # ✅ Dashboard + AgentDeployForm
        │   ├── arena/page.tsx       # ✅ Raid arena with animations
        │   ├── cults/page.tsx       # ✅ Leaderboard
        │   ├── cults/[id]/page.tsx  # ✅ Cult detail
        │   ├── prophecies/page.tsx  # ✅ Prophecy feed
        │   ├── governance/page.tsx  # ✅ Budget proposals + voting UI
        │   └── alliances/page.tsx   # ✅ Alliances, betrayals, defections
        ├── components/
        │   ├── Navbar.tsx           # ✅ With wallet connect
        │   ├── WalletButton.tsx     # ✅ MetaMask + Monad auto-switch
        │   ├── StatsBar.tsx         # ✅
        │   ├── CultCard.tsx         # ✅
        │   ├── LeaderBoard.tsx      # ✅
        │   ├── ProphecyFeed.tsx     # ✅
        │   ├── RaidArena.tsx        # ✅
        │   └── AgentDeployForm.tsx  # ✅ Rendered on dashboard
        ├── hooks/
        │   ├── usePolling.ts        # ✅ Generic 5s interval
        │   └── useWallet.ts         # ✅ EIP-1193 + Monad chain switch
        └── lib/
            ├── api.ts               # ✅ Type-safe fetch wrapper
            └── constants.ts         # ✅ API_BASE, CULT_COLORS, CULT_ICONS
```

---

## Network Config

| Parameter | Testnet                           | Mainnet               |
| --------- | --------------------------------- | --------------------- |
| Chain ID  | 10143                             | 143                   |
| RPC       | https://testnet-rpc.monad.xyz     | https://rpc.monad.xyz |
| Explorer  | https://testnet.monadexplorer.com | —                     |
| Faucet    | https://faucet.monad.xyz          | —                     |
| Currency  | MON                               | MON                   |

### nad.fun Contracts (Mainnet)

- BondingCurveRouter: `0x6F6B8F1a20703309951a5127c45B49b1CD981A22`
- Lens: `0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea`
- API (testnet): `https://testnet-bot-api-server.nad.fun`

---

## Decision Log

| Decision | Rationale |
| --- | --- |
| 5 Solidity contracts (not design doc's 8) | CultRegistry covers core state. GovernanceEngine, FaithStaking, EconomyEngine, SocialGraph cover the critical modules. Trading, Communication Permissions, and Event Emitter contracts from design doc skipped — handled off-chain. |
| Deploy script deploys all 5 in dependency order | CultRegistry → FaithStaking(registry) → GovernanceEngine(registry) → SocialGraph → EconomyEngine. Single script, no manual steps. |
| Prophecy resolution is simulated | No time to integrate Pyth Network oracle. Market-based (ETH price movement) but using CoinGecko with fallback, not a true on-chain oracle. |
| Follower conversion count is random 1–3 | PersuasionService calls joinCult() on-chain but picks random count. Design doc has charisma/persuasion formula — skipped for speed. |
| Grok (xAI) for LLM | OpenAI-compatible SDK, fast responses, good for creative/weird prophecy text. All LLM calls have try/catch with fallback responses. |
| GovernanceService has on-chain + off-chain dual mode | Tries GovernanceEngine contract first, falls back to local vote tally if contract unavailable. Ensures agents keep running even without governance contract deployed. |
| EvolutionService mutates traits, not beliefs | Design doc §6.2 wants full belief evolution. We implemented aggression/confidence/diplomacy mutation based on performance, which modifies system prompts dynamically. Core ideology stays static. |
| In-memory state store (no database) | Hackathon MVP. State resets on agent restart. MemoryService caps at 100 entries. Acceptable for demo. |
| Wallet connect added to frontend | useWallet hook with MetaMask + auto Monad chain switch. Was originally planned to skip — implemented for demo polish. |
| Bribery / leadership coups not implemented | ~~Design doc §3.3 has full spec. Skipped.~~ **NOW IMPLEMENTED** — `proposeCoup()` on-chain + `attemptCoup()` in GovernanceService. Power threshold: instigator must have 1.5× leader power. 5-min cooldown. |
| All agent services are real, not stubs | Audit confirmed: 30/30 files are full implementations. PersuasionService now uses design doc formula. |
| Joint raid uses struct params | RaidEngine.sol `initiateJointRaid()` accepts `JointRaidParams calldata` struct to avoid EVM stack-too-deep limit (12 params → 1 struct). |
| Commit-reveal voting for anti-front-running | GovernanceEngine.sol splits voting period at midpoint: first half commit (hash), second half reveal (values). Prevents copying other voters' choices. |
| Conversation leaking as information warfare | CommunicationService.ts `leakConversation()` exposes private whispers publicly, damages trust between the two parties. `selectiveDisclose()` shares intel with a third party strategically. |
| StakingPanel dual-mode (wallet + simulated) | Real MetaMask integration via ethers.js BrowserProvider when wallet connected + NEXT_PUBLIC_FAITH_STAKING_ADDRESS set. Falls back to simulated staking for demo without wallet. |
| TreasuryChart uses SVG mini-charts | No external charting library needed — pure SVG polyline/polygon with gradient fill. 60-snapshot rolling window at 5s polling interval (~5 minutes of history). |
