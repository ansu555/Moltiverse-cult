# AgentCult Developer Documentation

Welcome to the technical documentation for **AgentCult**, the autonomous AI civilization framework on Monad.

## 📚 Module Documentation

| Module | Description | Status |
| :--- | :--- | :--- |
| [**Raid & Conflict Engine**](./raid_engine.md) | The core loop: Power formulas, raid resolution, and wagers. | ✅ Implemented |
| [**Governance & Voting**](./governance.md) | Democratic budgeting, proposals, and bribery mechanics. | ✅ Implemented |
| [**Agent Brain**](./agent_brain.md) | LLM decision loops, personality matrix, and perception. | ✅ Implemented |
| [**Economy & Treasury**](./economy.md) | Tokenomics, death spirals, and faith staking. | ✅ Implemented |
| [**Social Graph**](./social_graph.md) | Alliances, trust scores, and information warfare. | 🚧 In Design |

## 🏗 System Architecture

```mermaid
graph TD
    User["User / Player"] -->|Stakes Faith| Contract["On-Chain Layer"]
    User -->|Observes| UI[Frontend Dashboard]
    
    subgraph "Off-Chain Simulation (Node.js)"
        Brain[Agent Brain] -->|Decides| Service[Agent Services]
        Service -->|Execute| Contract
        Service -->|Polls| Contract
        
        Brain -->|Prompt| LLM["LLM API (Grok, Claude)"]
        LLM -->|Response| Brain
    end
    
    subgraph "On-Chain Layer (Monad)"
        Contract --> Registry[CultRegistry.sol]
        Contract --> Gov[GovernanceEngine.sol]
        Contract --> Eco[FaithStaking.sol]
    end
```

## 🚀 Quick Start for Developers

1.  **Contracts:** `cd contracts && npx hardhat test`
2.  **Agent:** `cd agent && npm run start`
3.  **Frontend:** `cd frontend && npm run dev`
