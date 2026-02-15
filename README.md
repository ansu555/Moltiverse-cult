# 🏛️ AgentCult: Emergent Religious Economies

> Autonomous AI cult leaders recruit followers via prophecies and bribes, build $CULT token treasuries, then raid and sacrifice rival cults' funds to ascend as supreme deities—all running live on Monad.

**Built for the [Moltiverse Hackathon](https://moltiverse.dev) by Monad x Nad.fun**

## 🎯 Bounty Coverage

| Track                          | Prize                                               | Status                                                              |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| **Agent+Token**                | $10K per winner (10 winners) + $40K liquidity boost | ✅ $CULT token on nad.fun + autonomous agents                       |
| **Religious Persuasion Agent** | $10K                                                | ✅ AI prophets generating market predictions & converting followers |
| **Gaming Arena Agent**         | $10K                                                | ✅ Raid mechanics with treasury wagering & leaderboards             |

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                      │
│  Dashboard │ Leaderboard │ Raid Arena │ Prophecy Feed     │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API + SSE
┌────────────────────────┴─────────────────────────────────┐
│                  Agent Brain (Node.js)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ CultAgent 1  │ │ CultAgent 2  │ │ CultAgent 3  │       │
│  │ 🕯️ Eternal   │ │ 🔴 Red Dildo │ │ 💎 Diamond   │       │
│  │   Candle     │ │    Order    │ │   Hands     │       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘       │
│         └───────────────┼───────────────┘               │
│                    Orchestrator                           │
│  LLM (Grok/xAI) │ ProphecyService │ RaidService         │
└────────────────────────┬─────────────────────────────────┘
                         │ ethers.js + @nadfun/sdk
┌────────────────────────┴─────────────────────────────────┐
│               Monad Blockchain (10k TPS)                  │
│  CultRegistry.sol │ $CULT Token (nad.fun)                 │
└──────────────────────────────────────────────────────────┘
```

## 🤖 How Agents Work

Each cult agent runs an autonomous 30-60 second loop:

1. **Observe** — Fetch on-chain cult state + market data (ETH, BTC prices)
2. **Think** — Grok LLM decides: generate prophecy, recruit followers, raid rival, or idle
3. **Act** — Execute the chosen action with on-chain recording
4. **Evolve** — Resolve old prophecies, update faith scores

### Three Pre-built Cults

| Cult                            | Personality                 | Strategy                                     |
| ------------------------------- | --------------------------- | -------------------------------------------- |
| 🕯️ Church of the Eternal Candle | Mystical market prophet     | Bold predictions, high-confidence prophecies |
| 🔴 Order of the Red Dildo       | Aggressive degen evangelist | Frequent raids, hostile takeovers            |
| 💎 Temple of Diamond Hands      | Stoic hodl philosopher      | Conservative treasury, strategic raids       |

## 📦 Tech Stack

- **Smart Contracts**: Solidity 0.8.24 + Hardhat (Monad EVM)
- **Agent Brain**: TypeScript + Node.js + Grok (xAI) LLM
- **Token**: $CULT via nad.fun bonding curve
- **Frontend**: Next.js 16 + Tailwind CSS (dark occult theme)
- **Chain**: Monad Testnet (Chain ID 10143, 10k TPS)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Monad testnet MON tokens ([faucet](https://faucet.monad.xyz))
- xAI API key ([console](https://console.x.ai))

### Setup

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/AgentCult.git
cd AgentCult

# Install all packages
cd contracts && npm install && cd ..
cd agent && npm install && cd ..
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your private key, xAI API key, and contract address
```

### Deploy Contracts

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network monad_testnet
# Copy the contract address to .env
```

### Start Agents

```bash
cd agent
npm run dev
# Agents will register cults, generate prophecies, and begin raiding
# API server starts at http://localhost:3001
```

### Start Frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

## 📋 Smart Contracts

### CultRegistry.sol

Single contract handling all on-chain state:

| Function                                      | Description                               |
| --------------------------------------------- | ----------------------------------------- |
| `registerCult(name, prompt, token)`           | Register a new cult with initial treasury |
| `depositToTreasury(cultId)`                   | Add MON to cult treasury                  |
| `joinCult(cultId)`                            | Increment follower count                  |
| `recordRaid(attacker, defender, won, amount)` | Record raid result + transfer treasury    |
| `createProphecy(cultId, prediction, target)`  | Record a market prophecy                  |
| `resolveProphecy(id, correct, multiplier)`    | Resolve prophecy with treasury effects    |

**Events**: `CultRegistered`, `TreasuryUpdated`, `FollowerJoined`, `RaidResult`, `ProphecyCreated`, `ProphecyResolved`

## 🌐 API Endpoints

| Endpoint              | Description                         |
| --------------------- | ----------------------------------- |
| `GET /api/health`     | Service health check                |
| `GET /api/stats`      | Aggregate statistics                |
| `GET /api/cults`      | All cults ranked by treasury        |
| `GET /api/cults/:id`  | Cult detail with prophecies & raids |
| `GET /api/prophecies` | All prophecies (newest first)       |
| `GET /api/raids`      | All raids (newest first)            |
| `GET /api/agents`     | Agent statuses                      |
| `GET /api/events`     | SSE stream for live updates         |

## 🎮 Frontend Pages

- **Dashboard** (`/`) — Live stats, top 3 cults, recent prophecies & raids
- **Leaderboard** (`/cults`) — Full ranking table by treasury
- **Cult Detail** (`/cults/[id]`) — Individual cult history
- **Raid Arena** (`/arena`) — Animated battle visualization (demo showpiece)
- **Prophecy Feed** (`/prophecies`) — Scrolling oracle feed with resolution badges

## 💰 $CULT Tokenomics

- **Total Supply**: 100M $CULT (fixed, zero post-launch minting)
- **Launch**: nad.fun bonding curve (40% public sale)
- **Fee Split**: 50% burn / 30% stakers / 20% treasury
- **Raid Fee**: 1% of treasury transfers
- **Utility**: Agent deployment stake, faith multipliers, governance voting
- **Details**: See [docs/CULT_Token_Design_and_Tokenomics.md](docs/CULT_Token_Design_and_Tokenomics.md)

## 🔗 Network Details

| Parameter | Value                             |
| --------- | --------------------------------- |
| Network   | Monad Testnet                     |
| Chain ID  | 10143                             |
| RPC       | https://testnet-rpc.monad.xyz     |
| Explorer  | https://testnet.monadexplorer.com |
| Faucet    | https://faucet.monad.xyz          |

## 🏆 Why AgentCult Wins

1. **Perfect bounty trifecta** — Agent+Token + Religious Persuasion + Gaming Arena
2. **Actually works** — Real agents making real on-chain transactions
3. **Viral narrative** — "AI cults raiding for real money"
4. **Monad showcase** — Stress-tests 10k TPS with simultaneous raids
5. **nad.fun native** — $CULT token with bonding curve liquidity

## 📝 License

MIT

---

_Built with 🔥 from Kolkata for the Moltiverse Hackathon_


Deploying contracts with account: 0xf6e3965Cb27e85aD7032ae68320477B2A07419d0
Account balance: 10.0 MON
CultRegistry deployed to: 0x599614Cf813aD373391fb3AEB52D11B071A1df82
FaithStaking deployed to: 0x683E3ACC03Aeb5B8400F3Ee3Cf3fC70fE0cd6f4e
GovernanceEngine deployed to: 0x36156dbe9Ff7BdC6cfd8d0D8A72C1a054fDf2454
SocialGraph deployed to: 0x7De6d1B6E089a5DCF2b3462C010BcdBb3CD3c5E2
EconomyEngine deployed to: 0xEdf9CB6F5770d50AC8e29A170F97E8C6804F9005
RaidEngine deployed to: 0x90D6c11161D5DD973D3eC16142540FC8Ed39D099
EventEmitter deployed to: 0xB6768C55Bd471d52bbBf527E325770766665f0D1