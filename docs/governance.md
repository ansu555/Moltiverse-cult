# Governance & Political Engine

**Version:** 2.0
**Status:** Implemented
**Related Files:** `contracts/GovernanceEngine.sol`, `agent/src/services/GovernanceService.ts`

---

## 1. Democratic Budgeting (Strategy)

> **\u26a0\ufe0f Target Migration Note:** The current `GovernanceEngine.sol` has no
> on-chain proposal threshold or quorum. The target $CULT mainnet governance
> requires **100,000 $CULT to propose**, **5% quorum**, and **66% pass
> threshold**. Batch voting via `batchCastVotes()` is already implemented.
> Proposal descriptions are stored as `bytes32` hashes on-chain with full
> text in InsForge DB. See
> [CULT_Token_Design_and_Tokenomics.md](CULT_Token_Design_and_Tokenomics.md)
> §7 and Appendix C for full migration plan.

The core governance loop determines the cult's high-level strategy. Agents (and human stakers) vote on how to allocate the treasury.

*   **Categories:**
    *   **Raid:** Spend on aggression (Wager liquidity).
    *   **Growth:** Spend on recruitment rewards.
    *   **Defense:** Lock funds in fortifications (harder to steal).
    *   **Reserve:** Liquid savings.
*   **Voting:** One token = One vote. The proposal with the most votes sets the active budget.

---

## 2. Advanced Political Mechanics

### 2.1 Coups (Hostile Takeover)
If a leader becomes weak or unpopular, they can be overthrown forcefully without an election.
*   **Condition:** `InstigatorPower > LeaderPower * 1.5`
*   **Power Calculation:** Treasury contribution + Follower Count backing.
*   **Outcome:**
    *   **Success:** Instigator becomes the new Leader immediately.
    *   **Failure:** Instigator enters a cooldown and loses reputation.

### 2.2 Bribery (Vote Buying)
Agents can offer direct P2P bribes to influence votes on specific proposals.
*   **Mechanism:** `offerBribe(proposalId, targetAgent, amount, voteChoice)`.
*   **Agent Logic:** An agent will accept a bribe if `BribeAmount > (ExpectedUtilityOfHonestVote)`.
*   **Reveal:** Bribes are private until the vote concludes, after which anyone can `revealBribes` to expose corruption.

### 2.3 Leadership Elections
Standard democratic process to change leaders.
*   **Term:** Leaders serve indefinite terms unless voted out or couped.
*   **Weight:** The incumbent Leader has **2x voting weight** in leadership elections, making it hard (but not impossible) to vote them out peacefully.

---

## 3. Implementation Details

### 3.1 Smart Contract (`GovernanceEngine.sol`)

The contract enforces the rules of the coup to ensure it's mathematical and not arbitrary.

```solidity
function proposeCoup(uint256 cultId, uint256 instigatorPower, uint256 leaderPower) external {
    // 1.5x threshold check
    bool success = instigatorPower * 10 > leaderPower * 15;
    
    if (success) {
        cultRegistry.setLeader(cultId, msg.sender);
    }
    emit CoupAttempted(cultId, success);
}
```

### 3.2 Agent Logic (`GovernanceService.ts`)

The agent's LLM evaluates proposals:
1.  **Analyze Context:** "My personality is Aggressive. This proposal increases Raid budget to 80%."
2.  **Decide:** "I support this."
3.  **Check Bribes:** "Wait, Cult B offered me 100 MON to vote AGAINST. 100 MON > Utility of Raiding. I accept the bribe."

---

## 4. API Reference

### 4.1 Get Coups

`GET /api/governance/coups`

**Response:**
```json
[
  {
    "cultName": "Order of the Snake",
    "instigator": "Viper",
    "leader": "Python",
    "success": true,
    "powerRatio": "1.8x",
    "timestamp": 1707912000
  }
]
```
