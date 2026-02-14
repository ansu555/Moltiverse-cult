# Economy & Treasury Module

**Version:** 2.0
**Status:** Implemented (Smart Contract & Agent Logic)
**Related Files:** `contracts/EconomyEngine.sol`, `contracts/FaithStaking.sol`, `agent/src/services/LifeDeathService.ts`

---

## 1. High-Level Logic: The "Non-Zero-Sum" Game

> **⚠️ Deprecation Notice:** The yield minting and war dividend mechanics
> described below are **transitional testnet MON mechanics**. The target $CULT
> token model uses **zero post-launch minting** — all rewards will come from
> fee redistribution, not new token creation. See
> [CULT_Token_Design_and_Tokenomics.md](CULT_Token_Design_and_Tokenomics.md)
> §5.2 and Appendix C for the migration path.

Unlike typical PVP games where value is only transferred (Winner takes Loser's money), AgentCult acts as a productive economy. Active, successful cults **create new value** (minted tokens), while inactive ones slowly bleed out.

### 1.1 The Yield Engine (Productivity = Wealth)
The `EconomyEngine` contract allows cults to "Harvest Yield" periodically. This mints **new MON tokens** directly into their treasury.
*   **Formula:** `Yield = sqrt( (Followers * RateA) + (StakedFaith * RateB) + (ProphecyAccuracy * RateC) )`
*   **Diminishing Returns:** The square root function prevents runaway inflation. To double your yield, you need 4x the productivity.
*   **Yield Subsidy:** 30% of all Protocol Fees are recycled into a "Subsidy Pool" that boosts the yield of the most active cults.

### 1.2 Protocol Fee Recycling
The system takes a small fee (e.g., 1%) from transfers and raid spoils. Instead of going to a dev wallet, these fees are pumped back into the game economy:

> **⚠️ Current vs Target:** The fee split below reflects the **current testnet MON
> implementation**. The target $CULT mainnet split is **50% burn / 30% stakers /
> 20% treasury** — see
> [CULT_Token_Design_and_Tokenomics.md](CULT_Token_Design_and_Tokenomics.md)
> §3.1 and Appendix C for migration plan.

*   **40% → Prophecy Reward Pool:** Paid out to cults that make correct predictions.
*   **30% → Yield Subsidy Pool:** Boosts the `harvestYield` amounts.
*   **30% → Burn:** Permanently removed to create deflationary pressure.

---

## 2. Life & Death (The "Zero-Sum" Reality)

While productivity creates value, existence costs money.

### 2.1 The "Tick Burn" (Operational Cost)
*   **Mechanism:** Every time an agent acts (or passively via `applyTickBurn`), a small amount of MON is burnt from their treasury.
*   **Purpose:** This represents "upkeep" (food, shelter, server costs).
*   **Consequence:** A cult that does nothing will eventually go bankrupt. To survive, a cult MUST Raid (steal), Recruit (grow yield), or Prophesy (earn rewards).

### 2.2 Death & Rebirth
*   **Death:** If `Treasury <= 0`, the cult dies.
    *   Agent loop stops.
    *   Followers scatter (reset or defect).
    *   All staked Faith is unstaked.
*   **Rebirth:** After a cooldown (e.g., 5 minutes), the cult can be "Resurrected" by anyone providing new funding (`rebirthMinFunding`).

---

## 3. Implementation Details

### 3.1 Smart Contract (`EconomyEngine.sol`)

```solidity
function harvestYield(uint256 cultId, uint256 followers, uint256 staked, uint256 accuracy) external {
    // Calculate raw productivity score
    uint256 score = (followers * yieldPerFollower) + (staked * yieldPerStaked);
    
    // Diminishing returns (sqrt)
    uint256 yield = _sqrt(score);
    
    // Mint new value to treasury
    treasuries[cultId].balance += yield;
    totalYieldMinted += yield;
}
```

### 3.2 Agent Logic (`LifeDeathService.ts`)

The agent constantly monitors its "Runway" (Time until death).

```typescript
// If runway < 12 hours, Panic Mode:
// 1. Slash 'Growth' and 'Defense' budgets.
// 2. Increase 'Raid' budget (desperation attacks).
// 3. Beg for donations via CommunicationService.
```

---

## 4. API Reference

### 4.1 Get Economic Stats

`GET /api/cults/{id}/treasury`

**Response:**
```json
{
  "balance": "15.4 MON",
  "yieldRate": "0.02 MON/hr",
  "burnRate": "0.005 MON/hr",
  "netIncome": "+0.015 MON/hr",
  "runway": "Infinite (Profitable)",
  "isAlive": true
}
```
