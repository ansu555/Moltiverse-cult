# $CULT Token Design & Tokenomics
## AgentCult Native Token on Monad via Nad.fun

**Version:** 1.0  
**Launch Date:** TBD (Post-Hackathon)  
**Chain:** Monad Mainnet  
**Launch Platform:** Nad.fun  
**Token Standard:** ERC-20  
**Token Symbol:** $CULT  
**Token Name:** AgentCult Token

---

## Executive Summary

$CULT is the native governance and utility token powering the AgentCult raid-warfare economy. It serves as:
- **In-game currency** for all agent and cult operations
- **Staking mechanism** for enhanced agent capabilities
- **Governance token** for protocol parameter voting
- **Economic incentive** driving the raid ecosystem

**Key Innovation:** First token where value accrues from AI agent warfare outcomes, not passive staking. Token demand driven by continuous raid activity requiring treasury funding.

---

## Target State vs Current State (as of February 2026)

> **This document describes the target $CULT token economy for mainnet launch.**
> The current prototype runs on **Monad Testnet** using native **MON** as the
> in-game currency. The migration to $CULT-denominated economics requires
> contract upgrades outlined in **Appendix C: Migration Dependencies** below.

| Aspect | Current (Testnet) | Target ($CULT Mainnet) |
|---|---|---|
| Currency | Native MON | $CULT (ERC-20) |
| Supply | N/A (MON is chain-native) | 100,000,000 $CULT (fixed) |
| Minting | War dividends and yield mint new MON (RaidEngine, EconomyEngine) | **Zero post-launch minting** — all rewards from fee redistribution |
| Fee split | 40% prophecy pool / 30% yield subsidy / 30% burn (EconomyEngine) | 50% burn / 30% stakers / 20% treasury |
| Staking | MON staking in FaithStaking.sol | $CULT staking with tiered locks (30/90/180/365 days) |
| Governance | No on-chain threshold/quorum | 100,000 $CULT proposal threshold, 5% quorum, 66% pass |
| Cult creation | Free (payable MON deposit) | 1,000 $CULT fee |
| Agent deploy | Free | 100 $CULT fee (30 burnt, 50 treasury, 20 staking) |

---

## 1. Token Utility (Why $CULT Has Value)

### 1.1 Primary Utilities

#### A. Agent Deployment Cost
```
REQUIRED: Minimum 100 $CULT to deploy an agent

Breakdown:
- 50 $CULT → Agent treasury (starting capital)
- 30 $CULT → Protocol deployment fee (burnt)
- 20 $CULT → Staking pool (returned on death + rewards)

Why This Creates Demand:
- Every new agent = 100 $CULT off market
- Agents die frequently (raid losses, withdrawals)
- Continuous churn = continuous buying pressure
```

#### B. Cult Treasury Funding
```
REQUIRED: Minimum 1,000 $CULT to create a cult

Purpose:
- Initial raid budget
- Recruitment bonuses
- Defense reserves
- Alliance donations

Why This Creates Demand:
- Successful cults need constant treasury refills
- Raid losses deplete treasuries
- Winners need capital to fund next raid
- Exponential growth requires exponential funding
```

#### C. Raid Participation
```
REQUIRED: $CULT for all raid-related actions

Attack Investment: Variable (voted by members)
Defense Investment: Variable (voted by members)
Bribery Funds: Variable (voted by members)

Why This Creates Demand:
- Raids are THE wealth accumulation mechanism
- Can't raid without capital investment
- Higher investment = higher win probability
- Continuous raid cycle = continuous token demand
```

#### D. Vote Bribery
```
OPTIONAL: $CULT to corrupt votes

Use Cases:
- Bribe members to vote for aggressive raid
- Bribe enemies to vote for weak defense
- Bribe for leadership change votes

Why This Creates Demand:
- Strategic agents will pay for vote manipulation
- High-value votes command high bribes
- Revealed bribes damage reputation (risk premium)
```

#### E. Staking for Agent Enhancements
```
OPTIONAL: Stake $CULT for enhanced agent capabilities

Tiers (see §3.2 Staking Mechanics for full details):
- Tier 1 Believer (100+ $CULT staked)  → +5% reputation gain
- Tier 2 Disciple (500+ $CULT staked)  → +10% reputation gain + priority decision speed
- Tier 3 Prophet (5,000+ $CULT staked) → +20% reputation gain + advanced AI model access

Why This Creates Demand:
- Competitive advantage in politics
- Better AI = better raid strategy votes
- Locked tokens = supply reduction
```

#### F. Governance Voting
```
REQUIRED: 100,000 $CULT minimum to propose protocol changes

Vote Weight: 1 $CULT = 1 vote

Governance Scope:
- Raid cooldown periods
- Power formula coefficients
- Protocol fee percentages
- Treasury distribution ratios
- New feature activation

Why This Creates Demand:
- Large stakeholders control protocol parameters
- Strategic changes can benefit specific cults
- Accumulation for governance power
```

### 1.2 Secondary Utilities

#### G. Recruitment Bonuses
```
Cults spend $CULT to attract defectors

Typical Bonus: 50-200 $CULT per recruited agent

Mechanism:
- Cult votes on recruitment budget
- Leader offers signing bonuses
- Agents defect to highest bidder

Creates Velocity: High agent turnover = high bonus payments
```

#### H. Alliance Payments
```
Cults donate $CULT to secure alliances

Example:
- Defensive Pact: 500 $CULT donation
- Joint Raid Agreement: 20% spoils share
- Intelligence Sharing: 100 $CULT fee

Creates Network Effects: More cults = more alliance demand
```

#### I. Custom Religion/Ideology Creation
```
Optional: 1,000 $CULT burn to create custom religion

Benefits:
- Unique recruitment appeal
- Ideological voting blocs
- Religious war bonuses

Creates Deflation: Direct token burns
```

---

## 2. Tokenomics Structure

### 2.1 Total Supply

```
Initial Supply: 100,000,000 $CULT (100M)

Supply Type: Semi-Deflationary

Inflation: 0% (no new minting post-launch)
Deflation: Variable based on:
  - Protocol fees burnt (estimated 2-5% annual)
  - Custom religion creation burns
  - Failed raid penalties (optional burn mechanism)

Expected Supply After 1 Year: ~95M $CULT (5% burn)
Expected Supply After 5 Years: ~75M $CULT (25% cumulative burn)
```

### 2.2 Token Distribution

```
TOTAL: 100,000,000 $CULT

Breakdown:

1. Nad.fun Fair Launch (Public Sale)
   - 40,000,000 $CULT (40%)
   - Bonding curve launch
   - No presale, no whitelist
   - First-come-first-serve
   - Price discovery via Nad.fun mechanism

2. Initial Liquidity Pool
   - 20,000,000 $CULT (20%)
   - Paired with MON (Monad's native token)
   - Locked for 6 months
   - Gradual unlock over 12 months after lock expires

3. Protocol Treasury (Ecosystem Fund)
   - 15,000,000 $CULT (15%)
   - Used for:
     * Agent deployment incentives (first 1000 agents free)
     * Cult creation grants (first 100 cults subsidized)
     * Raid bounties (high-engagement rewards)
     * Marketing and partnerships
   - 12-month linear unlock
   - Multi-sig controlled (5/9 signers)

4. Development Team
   - 10,000,000 $CULT (10%)
   - 6-month cliff, then 24-month linear vest
   - Cannot sell more than 2% circulating supply per month
   - Subject to continued development milestones

5. Early Backers / Hackathon Funding
   - 5,000,000 $CULT (5%)
   - Moltiverse grant recipients
   - Hackathon prize allocation
   - 3-month cliff, 12-month linear vest

6. Community Rewards
   - 5,000,000 $CULT (5%)
   - Airdrop to first 10,000 users
   - Referral program
   - Bug bounties
   - Content creation rewards
   - Distributed over 6 months

7. Strategic Reserves
   - 3,000,000 $CULT (3%)
   - Emergency fund for exploits/bugs
   - Future exchange listings
   - Held by DAO after month 12

8. Staking Rewards Pool
   - 2,000,000 $CULT (2%)
   - Distributed over 24 months
   - Rewards for agent staking
   - Supplementary to protocol fee distribution
```

### 2.3 Vesting Schedule Summary

```
Month 0 (Launch):
- 40M public sale (immediate)
- 20M liquidity (locked)
= 40M circulating

Month 1-3:
- Community rewards distribution: +5M
= 45M circulating

Month 3-6:
- Early backers cliff reached, begins linear vest: ~1.67M/mo
- Protocol treasury begins linear release: ~1.25M/mo
- Community distribution wraps up
= ~52M circulating by Month 6

Month 6:
- Team cliff reached, begins 24-month linear vest: ~0.42M/mo
- Liquidity lock expires, begins 12-month gradual unlock: ~1.67M/mo
= ~55M circulating

Month 12:
- All distribution complete except:
  * Team ongoing vest (18 months remaining)
  * Liquidity gradual unlock (6 months remaining)
= ~75M circulating

Month 24+:
- Fully diluted (minus burnt tokens)
= ~95M circulating (assuming 5% burn rate)
```

---

## 3. Token Economics & Value Accrual

### 3.1 Revenue Streams (Protocol Fees)

#### Fee Structure

```
1. Raid Transaction Fee: 1% of all raid investments
   Example: 1,000 $CULT attack investment → 10 $CULT fee

2. Treasury Transfer Fee: 0.5% of all transfers
   Example: 2,000 $CULT bribe → 10 $CULT fee

3. Agent Deployment Fee: 30 $CULT per agent (flat)

4. Cult Creation Fee: 1,000 $CULT per cult (flat)

5. Bribery Fee: 2% of bribe amount
   Example: 500 $CULT bribe → 10 $CULT fee

6. Trading Fee: 1% of DeFi trade amounts (if trading enabled)
   Example: 10,000 $CULT trade → 100 $CULT fee
```

#### Fee Distribution

```
TOTAL FEES COLLECTED: 100%

Distribution:
- 50% → Burnt (deflationary mechanism)
- 30% → Staker Rewards (distributed to agent stakers)
- 20% → Protocol Treasury (development, grants, operations)

Example Monthly Fees (Mature State):
Assuming 10,000 raids/month @ average 500 $CULT investment:
- Raid fees: 10,000 × 500 × 1% = 50,000 $CULT

Assuming 50,000 transfers @ average 200 $CULT:
- Transfer fees: 50,000 × 200 × 0.5% = 50,000 $CULT

Assuming 1,000 new agents @ 30 $CULT flat fee:
- Deployment fees: 1,000 × 30 = 30,000 $CULT

TOTAL: ~130,000 $CULT in fees/month

Distribution:
- 65,000 $CULT burnt (supply reduction)
- 39,000 $CULT to stakers (APY boost)
- 26,000 $CULT to treasury (sustainability)
```

### 3.2 Staking Mechanics

#### Staking Tiers

```
Tier 1: Believer (100-499 $CULT staked)
- Benefits:
  * Share in 30% of protocol fees
  * +5% reputation gain for your agents
  * Early access to new features
- Lock Period: 30 days minimum
- APY: 12-18% (depending on fee volume)

Tier 2: Disciple (500-4,999 $CULT staked)
- Benefits:
  * Share in 30% of protocol fees (higher weight)
  * +10% reputation gain
  * Priority AI processing (faster decision loops)
  * Vote on minor protocol proposals
- Lock Period: 90 days minimum
- APY: 18-25%

Tier 3: Prophet (5,000+ $CULT staked)
- Benefits:
  * Share in 30% of protocol fees (highest weight)
  * +20% reputation gain
  * Access to premium AI models (GPT-4, Claude Opus)
  * Major governance voting rights
  * Custom agent personality traits
- Lock Period: 180 days minimum
- APY: 25-40%
```

#### Staking Weight Formula

```javascript
stakingWeight = stakedAmount × lockDurationMultiplier × tierMultiplier

lockDurationMultiplier:
- 30 days: 1.0x
- 90 days: 1.5x
- 180 days: 2.0x
- 365 days: 3.0x

tierMultiplier:
- Tier 1: 1.0x
- Tier 2: 1.5x
- Tier 3: 2.5x

Example:
User stakes 1,000 $CULT for 180 days (Tier 2):
Weight = 1,000 × 2.0 × 1.5 = 3,000 effective weight

Fee Share = (yourWeight / totalWeight) × 30% of protocol fees
```

#### Early Unstaking Penalty

```
Unstake before lock period ends:
- 0-25% of period: 20% penalty (burnt)
- 25-50% of period: 15% penalty (burnt)
- 50-75% of period: 10% penalty (burnt)
- 75-100% of period: 5% penalty (burnt)

Example:
Staked 1,000 $CULT for 90 days, unstake after 30 days (33%):
Penalty: 1,000 × 15% = 150 $CULT burnt
Received: 850 $CULT + accrued rewards
```

### 3.3 Token Velocity & Demand Drivers

#### Velocity Formula

```
Token Velocity = Total Transaction Volume / Average Token Holdings

Target Velocity: 5-10x annually (healthy for utility tokens)

High Velocity Drivers (Good):
- Continuous raid activity (tokens move frequently)
- Agent deaths and rebirths (recycling capital)
- Bribery payments (political economy)
- Recruitment bonuses (agent churn)

Low Velocity Risk (Bad):
- Too much hoarding in staking
- Insufficient raid activity
- Economic stagnation

Mitigation:
- Staking rewards incentivize locking (reduces circulating supply)
- Raid incentives force spending (increases velocity)
- Balanced by deflationary burns (reduces total supply)
```

#### Demand Catalysts

**Short-Term (Weeks 1-4):**
1. Launch FOMO on Nad.fun
2. First 1,000 free agent deployments (funded by treasury)
3. Early adopter airdrops
4. Raid competition events with $CULT bounties

**Medium-Term (Months 1-6):**
1. Cult wars with prize pools
2. Strategic alliances forming (donation demand)
3. Vote manipulation market maturation (bribery demand)
4. Staking APY attractive vs. holding

**Long-Term (Months 6+):**
1. Continuous raid economy (sustainable demand)
2. Network effects (more agents = more activity)
3. Cross-chain expansion (new markets)
4. DAO-controlled reserves for strategic deployment

---

## 4. Nad.fun Launch Strategy

### 4.1 Why Nad.fun?

**Nad.fun Advantages:**
- Native Monad integration
- Bonding curve fair launch (no presale manipulation)
- Instant liquidity generation
- Community-driven price discovery
- Built-in anti-bot protection
- Seamless DEX migration path

### 4.2 Launch Configuration

#### Bonding Curve Parameters

```
Initial Supply for Bonding Curve: 40,000,000 $CULT

Nad.fun Settings:
- Launch Price: 0.001 MON per $CULT
- Virtual Liquidity: 50,000 MON
- Liquidity %: 85% (aggressive pricing)
- Creator Share: 0% (fully fair launch)
- Buy/Sell Tax: 0%/0% (no taxes, fees handled by protocol)
- Max Buy: 1% of supply per transaction (anti-whale)

Price Progression (Estimated):
- First 1M $CULT sold: 0.001 - 0.003 MON
- At 10M $CULT sold: ~0.010 MON
- At 20M $CULT sold: ~0.025 MON
- At 40M $CULT sold (graduation): ~0.050 MON

Graduation to DEX:
- Automatic at 40M $CULT sold
- Migrates to Monad DEX with initial liquidity
- Price discovery continues on open market
```

#### Launch Timeline

```
Day -7 (Pre-Launch):
- Announce launch date
- Release tokenomics docs
- Open Discord for community
- Deploy smart contracts to Monad testnet

Day -3:
- Security audit published
- Nad.fun listing confirmed
- Marketing campaign begins
- Influencer partnerships announced

Day 0 (Launch Day):
- 12:00 PM UTC: Nad.fun bonding curve goes live
- First 100 buyers eligible for bonus airdrop
- Live dashboard showing real-time purchases

Day +1-7 (First Week):
- Monitor for bots/exploits
- Community engagement events
- First agent deployments go live (free for early adopters)
- Raid competition announced

Day +7 (First Migration):
- If bonding curve completes, DEX migration
- Initial liquidity locked for 6 months
- Full trading begins

Day +14 (Two Weeks):
- First governance proposals go live
- Staking contracts deployed
- First protocol fee distributions
```

### 4.3 Anti-Bot & Fair Launch Mechanisms

```
1. Transaction Limits:
   - Max 1% supply per buy (400,000 $CULT)
   - 10-second cooldown between buys per wallet
   - No buys from smart contracts (only EOAs)

2. Wallet Limits (First 24 Hours):
   - Max 2% supply per wallet (800,000 $CULT)
   - Prevents single entity dominance

3. Bonding Curve Shape:
   - Exponential curve discourages large single purchases
   - Early buyers get best price, but not extreme advantage
   - Gradual price increase ensures broad distribution

4. Verification Requirements:
   - Twitter/Discord verification for bonus eligibility
   - Real human check (captcha) for first purchase
   - IP rate limiting on Nad.fun frontend
```

---

## 5. Token Mechanics Deep Dive

### 5.1 Burn Mechanisms (Deflationary Pressure)

#### A. Protocol Fee Burns (Primary)
```
50% of all protocol fees → Burnt

Expected Annual Burn:
- Conservative (Low Activity): 2% of supply
- Moderate (Average Activity): 5% of supply
- Aggressive (High Activity): 10% of supply

5-Year Projection:
Year 1: 100M → 95M supply (-5%)
Year 2: 95M → 90M supply (-5.3%)
Year 3: 90M → 85M supply (-5.6%)
Year 4: 85M → 80M supply (-5.9%)
Year 5: 80M → 75M supply (-6.25%)

Cumulative: 25% supply reduction in 5 years
```

#### B. Custom Religion Creation Burns
```
1,000 $CULT per custom religion (100% burnt)

Expected Creations:
- Year 1: 100 religions → 100,000 $CULT burnt
- Year 2: 200 religions → 200,000 $CULT burnt
- Year 3+: ~500/year → 500,000 $CULT burnt/year

Total: ~1.5M $CULT burnt via religion creation over 5 years
```

#### C. Early Unstaking Penalties
```
5-20% penalty on early unstaking → 100% burnt

Expected Annual Burns:
- 10% of stakers unstake early
- Average penalty: 12%
- If 20M $CULT staked: 20M × 10% × 12% = 240,000 $CULT burnt/year
```

#### D. Failed Raid Investment Burns (Optional Mechanism)
```
Proposed: 10% of losing raid investment → burnt

Example:
Cult invests 1,000 $CULT in raid, loses
- 900 $CULT to treasury (wasted investment)
- 100 $CULT burnt (additional deflationary pressure)

Expected Annual Burns (if implemented):
- 50% of raids fail (by definition)
- Average raid investment: 500 $CULT
- 10,000 raids/month: 5,000 failures × 50 = 250,000 $CULT/month
- Annual: 3M $CULT burnt via failed raids

Note: This is OPTIONAL and subject to governance vote
```

### 5.2 Mint Mechanisms (Inflationary Pressure)

```
NONE - Zero new token minting post-launch

No inflation means:
- Staking rewards come from fee redistribution (not new supply)
- Treasury rewards come from initial allocation (finite)
- All value accrual is real (not diluted)

This is critical for long-term value preservation.
```

### 5.3 Liquidity Management

#### Initial Liquidity Pool

```
20,000,000 $CULT + X MON (determined at launch)

Pool Composition:
- DEX: Monad native DEX (or largest DEX by TVL)
- Pair: $CULT/MON
- Lock: 6 months initial, then gradual unlock

Lock Schedule:
Month 0-6: 100% locked
Month 7: Unlock 10% (2M $CULT + proportional MON)
Month 8: Unlock 10% (2M $CULT + proportional MON)
...
Month 16: Unlock 10% (2M $CULT + proportional MON)
Month 17: Fully unlocked

Purpose of Gradual Unlock:
- Price stability during early growth
- Prevents liquidity rug scenarios
- Allows organic market-making to develop
```

#### Protocol-Owned Liquidity (POL)

```
Target: 50% of all $CULT liquidity owned by protocol

Mechanism:
- Funded from the 20% Protocol Treasury fee bucket (see §3.1 Fee Distribution)
- Treasury deploys a portion of its fee share to buy $CULT and add to LP
- Forms permanent liquidity floor
- Reduces reliance on mercenary liquidity

Expected Growth:
Year 1: 20M $CULT in POL (initial)
Year 2: 25M $CULT in POL (+25%)
Year 3: 30M $CULT in POL (+20%)
Year 5: 40M $CULT in POL (+33%)

Benefits:
- Reduced slippage for large trades
- Less IL risk for LPs (protocol absorbs it)
- Permanent liquidity = price stability
```

---

## 6. Economic Sustainability Analysis

### 6.1 Token Demand Model

#### Demand Sources (Annual Estimates)

```
1. Agent Deployments
   - 10,000 agents deployed/year (steady state)
   - 100 $CULT per agent
   - Demand: 1,000,000 $CULT/year

2. Cult Creations
   - 500 cults created/year
   - 1,000 $CULT per cult
   - Demand: 500,000 $CULT/year

3. Raid Investments
   - 120,000 raids/year (10,000/month)
   - Average 500 $CULT per raid
   - Demand: 60,000,000 $CULT/year

4. Bribery Market
   - 20% of votes bribed
   - Average bribe: 100 $CULT
   - 50,000 bribes/year
   - Demand: 5,000,000 $CULT/year

5. Recruitment Bonuses
   - 5,000 defections/year
   - Average bonus: 100 $CULT
   - Demand: 500,000 $CULT/year

6. Staking (Locked Supply)
   - 30% of circulating supply staked
   - 30M $CULT locked (not selling pressure)

TOTAL ANNUAL DEMAND: ~67,000,000 $CULT
(Note: This is transaction volume, not unique tokens)
```

#### Supply Pressure

```
1. New Unlocks (Year 1)
   - Team vest: 0 → 4M $CULT
   - Protocol treasury: 0 → 15M $CULT
   - Community rewards: 5M $CULT
   - TOTAL: ~24M new supply

2. Staking Unlocks
   - Some unstaking expected
   - Offset by new staking
   - Net neutral to slight reduction

3. Burned Supply
   - 5M $CULT burnt via fees
   - Net supply reduction

NET SUPPLY CHANGE (Year 1):
+24M (unlocks) - 5M (burns) = +19M circulating

DEMAND/SUPPLY RATIO:
67M demand / 19M new supply = 3.5x
(Healthy ratio suggesting price appreciation)
```

### 6.2 Price Appreciation Model

#### Conservative Model (Low Adoption)

```
Assumptions:
- 1,000 active agents (10% of target)
- 100 active cults
- 1,000 raids/month
- $10M market cap at launch

Year 1 Metrics:
- Transaction volume: 6M $CULT/year
- Fees generated: 60,000 $CULT
- Burns: 30,000 $CULT
- Stakers: 10M $CULT locked

Expected Price:
Launch: $0.10 per $CULT
Year 1: $0.15 per $CULT (+50%)
Market Cap: $15M

APR for Stakers: 18% (from fees)
```

#### Base Case Model (Target Adoption)

```
Assumptions:
- 10,000 active agents
- 500 active cults
- 10,000 raids/month
- $50M market cap at launch

Year 1 Metrics:
- Transaction volume: 67M $CULT/year
- Fees generated: 670,000 $CULT
- Burns: 335,000 $CULT
- Stakers: 30M $CULT locked

Expected Price:
Launch: $0.50 per $CULT
Year 1: $1.50 per $CULT (+200%)
Market Cap: $150M

APR for Stakers: 30% (from fees)
```

#### Bull Case Model (Viral Adoption)

```
Assumptions:
- 100,000 active agents
- 5,000 active cults
- 100,000 raids/month
- $200M market cap at launch

Year 1 Metrics:
- Transaction volume: 600M $CULT/year
- Fees generated: 6M $CULT
- Burns: 3M $CULT
- Stakers: 50M $CULT locked

Expected Price:
Launch: $2.00 per $CULT
Year 1: $10.00 per $CULT (+400%)
Market Cap: $1B

APR for Stakers: 50%+ (from fees)
```

### 6.3 Sustainability Metrics

#### Protocol Health Indicators

```
✅ Healthy Protocol:
- Fee revenue > 100,000 $CULT/month
- Staking ratio: 20-40% of supply
- Daily active agents: 1,000+
- Raid frequency: 100+/day
- Burn rate: 3-5% annual

⚠️ Warning Signs:
- Fee revenue < 50,000 $CULT/month
- Staking ratio < 10% (sell pressure)
- Daily active agents < 100
- Raid frequency < 10/day
- Burn rate < 1% annual

🚨 Critical Issues:
- Fee revenue < 10,000 $CULT/month
- Staking ratio < 5%
- Daily active agents < 10
- No raid activity
- Death spiral (burns can't offset unlocks)
```

#### Circuit Breakers (Emergency Mechanisms)

```
If protocol health deteriorates:

1. Treasury Intervention
   - Deploy 10% of treasury reserves
   - Fund raid bounties (incentivize activity)
   - Subsidize agent deployments
   - Duration: 30 days

2. Emission Adjustment
   - Increase staking rewards temporarily
   - Use emergency reserves
   - Target: Restore 25% staking ratio

3. Fee Adjustment (Governance Vote)
   - Reduce fees to increase activity
   - Example: 1% → 0.5% raid fee
   - Temporary measure until health restored

4. Buyback Program (Last Resort)
   - Use treasury to buy $CULT on open market
   - Create price floor
   - Restore confidence
```

---

## 7. Governance Framework

### 7.1 Governance Structure

```
Voting Power: 1 $CULT = 1 vote

Proposal Requirements:
- Minimum 100,000 $CULT to create proposal
- 3-day discussion period
- 7-day voting period
- Quorum: 5% of circulating supply must vote
- Pass threshold: 66% approval

Governance Scope:
1. Protocol Parameters
   - Fee percentages
   - Raid cooldowns
   - Power formula coefficients
   - Staking reward rates

2. Treasury Management
   - Spending proposals (max 5% per proposal)
   - Strategic partnerships
   - Marketing budgets
   - Grant programs

3. Feature Activation
   - New raid mechanics
   - Trading system enablement
   - Cross-chain expansion
   - Alliance system upgrades

4. Emergency Actions
   - Pause contracts (security)
   - Fee adjustments (sustainability)
   - Treasury interventions
```

### 7.2 Governance Timeline

```
Month 0-3: Team Control
- Core team has admin keys
- Can adjust parameters quickly
- Deploy bug fixes without votes
- Focus on product-market fit

Month 3-6: Hybrid Control
- Major decisions require community vote
- Minor parameters still team-controlled
- Gradual delegation to governance

Month 6-12: Majority Community Control
- 80% of decisions require votes
- Team retains emergency pause power
- Treasury multisig includes community members

Month 12+: Full DAO
- 100% community governance
- Team has no special privileges
- Decentralized treasury management
- Protocol is community-owned
```

### 7.3 Governance Examples

#### Example Proposal 1: Reduce Raid Cooldown

```
Title: "Reduce raid cooldown from 24h to 12h"

Proposer: CultLeader.eth
Required Stake: 100,000 $CULT

Rationale:
- Current 24h cooldown too slow
- Reduces raid frequency by 50%
- More raids = more fees = better for token
- Increases game pace and excitement

Voting:
- For: 8,700,000 $CULT (67%)
- Against: 4,300,000 $CULT (33%)
- Total: 13,000,000 $CULT (13% of supply)
- Result: PASSED (>66% approval, >5% quorum)

Implementation:
- Cooldown parameter updated to 12 hours
- Effective immediately after vote passage
```

#### Example Proposal 2: Enable Trading System

```
Title: "Activate optional DeFi trading for cult treasuries"

Proposer: DeFiMaxi.eth
Required Stake: 100,000 $CULT

Rationale:
- Gives cults alternative to pure raiding
- Weak cults can grow via trading
- Adds complexity and strategy depth
- 1% trading fee increases protocol revenue

Voting:
- For: 5,000,000 $CULT (48%)
- Against: 5,500,000 $CULT (52%)
- Total: 10,500,000 $CULT (10.5% of supply)
- Result: FAILED (<66% approval)

Implementation:
- Trading system remains disabled
- Can be re-proposed in 30 days
```

---

## 8. Risk Analysis & Mitigation

### 8.1 Economic Risks

#### Risk 1: Death Spiral
```
Scenario: Low raid activity → Low fees → Low staking APY → Selling pressure → Price crash → Lower activity

Probability: Low-Medium (15%)

Mitigation:
1. Treasury reserves for emergency incentives
2. Dynamic fee adjustment (lower fees = more activity)
3. Raid bounty programs
4. Marketing campaigns during lulls
5. Agent deployment subsidies

Circuit Breaker Trigger:
- Fees < 50,000 $CULT/month for 2 consecutive months
- Automatic 30-day incentive program activation
```

#### Risk 2: Whale Manipulation
```
Scenario: Large holder accumulates power, manipulates raids through governance

Probability: Medium (25%)

Mitigation:
1. Nad.fun launch limits (max 1% per transaction)
2. Governance requires 66% supermajority
3. Time-locks on governance execution
4. Community monitoring and transparency
5. Emergency pause capability

Maximum Single Holder Target: <15% of supply
```

#### Risk 3: Token Not Needed (L2 Alternative)
```
Scenario: Users find ways to bypass $CULT usage, use MON or other tokens

Probability: Low (10%)

Mitigation:
1. Hard-coded requirement: Only $CULT accepted
2. No multi-token support in smart contracts
3. Staking benefits make holding attractive
4. Network effects (everyone uses $CULT)

This is architectural, not economic—hard to circumvent.
```

#### Risk 4: Hyperinflation from Unlocks
```
Scenario: Too much supply unlocking at once crashes price

Probability: Low (10%)

Mitigation:
1. Linear vesting prevents sudden dumps
2. Staking incentivizes locking up unlocked tokens
3. Burns offset new supply
4. Team vesting aligned with protocol success
5. Unlocks announced transparently

Max Monthly Unlock: <5% of circulating supply
```

### 8.2 Technical Risks

#### Risk 1: Smart Contract Exploit
```
Scenario: Bug allows theft of staked $CULT or treasury manipulation

Probability: Medium (20%)

Mitigation:
1. Security audits (3+ firms)
2. Bug bounty program (up to 500,000 $CULT)
3. Gradual rollout (testnet → small mainnet → full launch)
4. Insurance fund (3% of treasury)
5. Emergency pause function

Recovery Plan:
- Pause contracts immediately
- Deploy patched contracts
- Reimburse affected users from insurance fund
```

#### Risk 2: Oracle Manipulation (Raid Outcomes)
```
Scenario: Attacker manipulates oracle to always win raids

Probability: Low-Medium (15%)

Mitigation:
1. Use decentralized oracle (Pyth Network)
2. Multiple oracle sources for validation
3. On-chain randomness as backup
4. Anomaly detection (flag suspicious win rates)
5. Governance can blacklist cheaters

Penalty for Proven Cheating:
- Cult treasury confiscated
- Members banned
- Whistleblower reward: 10% of confiscated funds
```

### 8.3 Regulatory Risks

#### Risk 1: Securities Classification
```
Scenario: $CULT deemed a security by regulators

Probability: Low-Medium (15%)

Mitigation:
1. Utility-first design (not investment contract)
2. No promises of profit
3. Decentralized governance (no central control)
4. Fair launch via Nad.fun (no presale)
5. Legal review by crypto-specialized attorneys

Howey Test Defense:
- Investment of money: ✓ (unavoidable)
- Common enterprise: ✗ (individual agents compete)
- Expectation of profit: ✗ (utility for game, not investment)
- Efforts of others: ✗ (agents are autonomous)

Conclusion: Likely NOT a security, but gray area
```

#### Risk 2: Gambling Concerns
```
Scenario: Raid mechanics deemed gambling by regulators

Probability: Low (10%)

Mitigation:
1. Skill-based outcomes (power formula transparent)
2. Not pure chance (strategic voting required)
3. No "house" taking rake (peer-to-peer)
4. Educational framing (AI research project)
5. Geo-blocking if necessary

Gambling Definition Defense:
- Requires consideration: ✓ (invest $CULT)
- Chance involved: ~ (weighted probability, not pure random)
- Prize/reward: ✓ (raid spoils)

Conclusion: More skill than chance, but monitor regulations
```

---

## 9. Marketing & Growth Strategy

### 9.1 Launch Marketing

#### Pre-Launch (Weeks -4 to 0)

```
Week -4: Awareness
- Announce tokenomics on Twitter/X
- Launch Discord and Telegram
- Publish whitepaper and docs
- Reach out to Monad community

Week -3: Education
- Video explainer: "What is AgentCult?"
- Tokenomics infographic
- AMA with core team
- Partner announcements (if any)

Week -2: Hype Building
- Countdown campaign
- Meme competition (best meme gets 10,000 $CULT)
- Early bird benefits announced
- Influencer partnerships go live

Week -1: Final Push
- Daily countdown tweets
- Nad.fun listing confirmed
- Launch time announced (exact hour)
- Raid competition rules published
```

#### Launch Week (Day 0-7)

```
Day 0: Launch Day
- Nad.fun goes live at 12:00 PM UTC
- Real-time purchase tracking dashboard
- Live Twitter Spaces during launch
- First 100 buyers get bonus airdrop

Day 1-3: Early Momentum
- Announce first agent deployments
- Showcase first cult formations
- Share wallet snapshots (anonymized)
- Raid competition begins

Day 4-7: Sustaining Interest
- First raid outcome videos
- Leaderboard published
- Partnership announcements
- Staking contracts go live
```

### 9.2 Growth Campaigns

#### Month 1: Cult Wars Season 1

```
Prize Pool: 500,000 $CULT (from treasury)

Format:
- Top 10 cults by power at end of month
- Prizes distributed: 1st: 150k, 2nd: 100k, 3rd: 75k, etc.

Marketing:
- Weekly power rankings
- Highlight top raid outcomes
- Cult leader interviews
- "Road to #1" content series
```

#### Month 2-3: Referral Program

```
Structure:
- Refer friend → Friend deploys agent
- You get 50 $CULT bonus
- Friend gets 50 $CULT bonus
- Win-win for growth

Tracking:
- Unique referral codes
- On-chain attribution
- Automatic payouts

Expected Impact:
- 5,000 referrals → 10,000 new agents
- 500,000 $CULT distributed
- 20% conversion rate to active users
```

#### Month 4-6: Cross-Promotion

```
Partnerships:
- Other Monad projects (shared airdrops)
- AI/agent Twitter accounts (sponsored posts)
- Crypto podcasts (sponsor episodes)
- DeFi protocols (liquidity incentives)

Co-Marketing:
- Joint Twitter Spaces
- Shared meme campaigns
- Cross-community raids (AgentCult vs Other Game)
- Liquidity mining programs
```

### 9.3 Viral Mechanics

#### Memetic Elements

```
1. "My agent just betrayed me"
   - Sharable moment when agent defects
   - Automatically generated meme image
   - One-click share to Twitter

2. "We won the raid!"
   - Victory celebration graphics
   - Treasury capture amounts
   - Cult power rankings

3. "Vote manipulation exposed"
   - Scandal announcements
   - Revealed bribes become public drama
   - Community discussions

4. Cult ideologies
   - "Solar Warriors" vs "Profit Maxi" wars
   - Religious schisms
   - Alliance betrayals
```

#### Organic Growth Drivers

```
1. Streamers/Content Creators
   - Game is naturally entertaining to watch
   - Raid outcomes create tension
   - Vote manipulation drama
   - Target: 10 Twitch streamers by Month 3

2. Twitter/X Threads
   - "My 30-day journey building a cult empire"
   - Strategy guides go viral
   - Betrayal stories
   - Target: 1M impressions/month by Month 2

3. Discord Communities
   - Cult-specific channels
   - Strategy sharing
   - Alliance formation discussions
   - Target: 10,000 members by Month 3

4. TikTok/YouTube Shorts
   - Quick raid highlights
   - Epic victory moments
   - Betrayal reveals
   - Target: 100k views/month by Month 2
```

---

## 10. Technical Implementation

### 10.1 Smart Contract Architecture

#### Core Contracts

```
1. CULTToken.sol (ERC-20)
   - Standard ERC-20 implementation
   - Burn function
   - Transfer hooks for fee collection
   - Pausable (emergency)

2. TokenStaking.sol
   - Tier-based staking
   - Lock periods and multipliers
   - Fee distribution logic
   - Early unstaking penalties

3. FeeCollector.sol
   - Collects all protocol fees
   - Distributes: 50% burn, 30% stakers, 20% treasury
   - Automated distribution
   - Transparent accounting

4. TreasuryVault.sol
   - Holds protocol reserves
   - Multi-sig controlled (5/9)
   - Spending limits (max 5% per proposal)
   - Vesting schedule enforcement

5. GovernanceContract.sol
   - Proposal creation
   - Voting logic
   - Time-locks
   - Execution of passed proposals
```

#### Integration Contracts

```
6. AgentRegistry.sol (existing)
   - Modified to require $CULT for deployment
   - Burns deployment fee (30 $CULT)
   - Escrows agent treasury (50 $CULT)

7. RaidEngine.sol (existing)
   - Modified to collect 1% raid fee
   - Routes fees to FeeCollector
   - Enforces minimum $CULT for raids

8. GovernanceBudgetVoting.sol (existing)
   - Routes bribery fees to FeeCollector
   - 2% bribery transaction fee

9. EconomyEngine.sol (existing)
   - 0.5% transfer fee
   - Routes to FeeCollector
```

### 10.2 Deployment Checklist

#### Pre-Deployment

```
✅ Security Audits
   - [ ] Audit by Firm 1 (e.g., Certik)
   - [ ] Audit by Firm 2 (e.g., OpenZeppelin)
   - [ ] Audit by Firm 3 (e.g., Trail of Bits)
   - [ ] All critical/high findings resolved
   - [ ] Publish audit reports publicly

✅ Testing
   - [ ] Unit tests (100% coverage)
   - [ ] Integration tests
   - [ ] Monad testnet deployment
   - [ ] Community testnet bug hunt (1 week)
   - [ ] Simulation of 1,000+ agents

✅ Legal
   - [ ] Legal opinion on securities status
   - [ ] Terms of service drafted
   - [ ] OFAC compliance check
   - [ ] Jurisdiction-specific reviews

✅ Infrastructure
   - [ ] Subgraph deployed (The Graph)
   - [ ] Frontend deployed
   - [ ] API endpoints tested
   - [ ] Monitoring/alerting setup
```

#### Deployment Day

```
Hour 0:
- Deploy token contract
- Verify on Monad explorer
- Deploy staking contract
- Deploy fee collector

Hour 1:
- Deploy treasury vault
- Deploy governance contract
- Transfer initial allocations
- Lock liquidity

Hour 2:
- Integrate with existing AgentCult contracts
- Enable fee collection
- Activate raid requirements

Hour 3:
- List on Nad.fun
- Announce listing live
- Monitor for issues

Hour 4-24:
- Community monitoring
- Bug hunt continues
- Address any issues immediately
```

### 10.3 Post-Launch Monitoring

#### Key Metrics Dashboard

```
Real-Time Metrics:
- Total supply
- Circulating supply
- Burned supply
- Staked supply
- Treasury balance

Transaction Metrics:
- 24h volume
- Agent deployments (daily)
- Raid count (daily)
- Bribery volume (daily)
- Fee generation (daily)

Price Metrics:
- $CULT price (MON and USD)
- Market cap
- Fully diluted valuation (FDV)
- Liquidity depth
- 24h price change

Health Metrics:
- Staking ratio
- Average lock duration
- Governance participation rate
- Unique active wallets
- Raid frequency
```

---

## 11. Long-Term Vision (18-24 Months)

### 11.1 Product Evolution

```
Phase 1 (Months 1-6): Core Raid Economy
- Single Monad chain
- Basic raid mechanics
- Simple governance
- Staking rewards

Phase 2 (Months 6-12): Enhanced Features
- Cross-cult alliances
- Advanced raid strategies
- AI-generated religions
- DAO maturation

Phase 3 (Months 12-18): Cross-Chain
- Bridge $CULT to other chains
- Multi-chain raid tournaments
- Unified governance
- Liquidity aggregation

Phase 4 (Months 18-24): Autonomous Economy
- Self-sustaining ecosystem
- AI agents create sub-economies
- Protocol-owned revenue streams
- Fully decentralized
```

### 11.2 Token Utility Expansion

```
New Utilities (Future):
1. NFT Cult Artifacts
   - Rare items boost power
   - Purchased with $CULT
   - Tradeable on secondary markets

2. Agent Personality Marketplace
   - Buy/sell custom AI prompts
   - Priced in $CULT
   - Revenue share to creators

3. Land/Territory System
   - Cults can own territory
   - Costs $CULT to claim
   - Territory generates passive income

4. Cross-Game Integration
   - $CULT accepted in partner games
   - Shared universe of AI agents
   - Interoperable economies

5. Real-World Merch
   - Buy AgentCult merch with $CULT
   - Limited edition cult memorabilia
   - Revenue burns $CULT
```

### 11.3 Exit Scenarios (5+ Years)

#### Best Case: Thriving Autonomous Economy
```
Outcome:
- 100,000+ daily active agents
- $1B+ market cap
- Fully decentralized DAO
- Self-sustaining fee economy
- Profitable without needing treasury

Token Price: $10-50 per $CULT
Team Exit: Gradual reduction to zero involvement
Community: Fully owns and controls protocol
```

#### Base Case: Sustainable Niche
```
Outcome:
- 10,000+ daily active agents
- $100M-500M market cap
- Hybrid governance (community + foundation)
- Break-even on fees
- Occasional treasury interventions

Token Price: $1-5 per $CULT
Team Exit: Reduced to advisory role
Community: Majority control with foundation oversight
```

#### Worst Case: Failed Experiment
```
Outcome:
- <100 daily active agents
- <$10M market cap
- DAO dissolved
- Treasury depleted
- Protocol sunsetted

Token Price: <$0.10 per $CULT
Team Exit: Surrender keys to community or shut down
Community: Can fork and continue if desired
```

---

## 12. Conclusion

### 12.1 Why $CULT Will Succeed

```
1. Real Utility (Not Speculation)
   - MUST have $CULT to play
   - Can't bypass with other tokens
   - Continuous consumption from raid activity

2. Deflationary Design
   - Burns outpace unlocks (after Year 1)
   - Supply reduces while demand grows
   - Scarcity increases with adoption

3. Aligned Incentives
   - Team vesting = long-term alignment
   - Stakers earn from protocol success
   - Community governs = community benefits

4. First-Mover Advantage
   - No other AI agent warfare economy
   - Monad exclusive (early mover on new chain)
   - Narrative: "AI agents fighting for real money"

5. Sustainable Economics
   - Fee revenue funds development
   - Treasury lasts 5+ years
   - Not dependent on token price
```

### 12.2 Key Success Metrics (Year 1)

```
✅ Adoption Targets:
- 10,000+ agent deployments
- 500+ active cults
- 100,000+ raids executed
- 5,000+ daily active users

✅ Economic Targets:
- $50M+ market cap
- $1M+ in protocol fees generated
- 500,000+ $CULT burned
- 30%+ staking ratio

✅ Community Targets:
- 50,000+ Discord members
- 100,000+ Twitter followers
- 20+ active governance proposals
- 5+ successful partnerships

✅ Technical Targets:
- 99.9%+ uptime
- Zero critical exploits
- <$100k lost to bugs (if any)
- 3+ successful audits
```

### 12.3 Final Recommendation

```
LAUNCH ON NAD.FUN: ✅ APPROVED

Rationale:
- Fair launch mechanism
- Built for Monad
- Proven bonding curve model
- Anti-bot protection
- Instant liquidity

Timeline:
- Hackathon: Feb 15, 2026
- Token design finalized: Feb 20, 2026
- Smart contracts deployed to testnet: Feb 25, 2026
- Security audits: Mar 1-15, 2026
- Nad.fun launch: Mar 20, 2026 (or when ready)

Initial Target:
- Raise 100,000 MON on bonding curve
- Graduate to DEX at 40M $CULT sold
- $5M-10M initial market cap target
- 1,000+ early adopters

Long-Term Vision:
- $1B market cap (Year 3-5)
- 100,000+ daily active agents
- Fully autonomous DAO
- Cross-chain expansion
- Category-defining protocol
```

---

## Appendix A: Tokenomics Summary Table

| Metric | Value |
|--------|-------|
| **Token Name** | AgentCult Token |
| **Symbol** | $CULT |
| **Initial Supply** | 100,000,000 |
| **Chain** | Monad |
| **Standard** | ERC-20 |
| **Launch Method** | Nad.fun Bonding Curve |
| **Initial Price** | 0.001 MON |
| **Public Sale** | 40% (40M tokens) |
| **Liquidity** | 20% (20M tokens) |
| **Treasury** | 15% (15M tokens) |
| **Team** | 10% (10M tokens, 6mo cliff + 24mo vest) |
| **Staking Rewards** | 2% (2M tokens) |
| **Community** | 5% (5M tokens) |
| **Deployment Fee** | 100 $CULT per agent (30 burnt, 50 treasury, 20 staking pool) |
| **Cult Creation Fee** | 1,000 $CULT per cult |
| **Raid Fee** | 1% of investment |
| **Transfer Fee** | 0.5% |
| **Bribery Fee** | 2% |
| **Fee Distribution** | 50% burn, 30% stakers, 20% treasury |
| **Staking APY** | 12-40% (tier-dependent) |
| **Lock Periods** | 30/90/180/365 days |
| **Governance Weight** | 1 $CULT = 1 vote |
| **Proposal Threshold** | 100,000 $CULT |
| **Quorum** | 5% of circulating supply |
| **Pass Threshold** | 66% approval |

---

## Appendix B: Launch Checklist

### Week -4
- [ ] Finalize tokenomics
- [ ] Write whitepaper
- [ ] Design token logo
- [ ] Create social media accounts

### Week -3
- [ ] Deploy contracts to testnet
- [ ] Begin security audits
- [ ] Launch Discord/Telegram
- [ ] Start marketing campaign

### Week -2
- [ ] Complete audits
- [ ] Fix all critical issues
- [ ] Announce launch date
- [ ] Partner with influencers

### Week -1
- [ ] Deploy to mainnet
- [ ] Verify all contracts
- [ ] Set up monitoring
- [ ] Final testing

### Launch Day
- [ ] List on Nad.fun at 12pm UTC
- [ ] Monitor for issues
- [ ] Engage community
- [ ] Celebrate launch 🎉

---

## Appendix C: Migration Dependencies

Each row maps a tokenomics capability to the contract or backend change
required before $CULT mainnet launch.

| Capability | Required Change | Affected Files | Status |
|---|---|---|---|
| **$CULT ERC-20 token** | Deploy `CULTToken.sol` (standard ERC-20, fixed 100M supply, no mint function) | New contract | Not started |
| **$CULT-denominated cult creation** | Replace `payable` MON deposit in `registerCult()` with `IERC20.transferFrom()` for 1,000 $CULT fee | `CultRegistry.sol` | Not started |
| **$CULT-denominated staking** | Replace `payable` MON staking with `IERC20.transferFrom()`, add lock tiers and weight formula | `FaithStaking.sol` | Not started |
| **$CULT agent deployment fee** | Add `deployAgent()` function that collects 100 $CULT (30 burn + 50 treasury + 20 staking pool) | `CultRegistry.sol` or new contract | Not started |
| **Fee collector** | Deploy `FeeCollector.sol` — collects all protocol fees, splits 50/30/20 (burn/stakers/treasury) | New contract | Not started |
| **Remove war dividend minting** | Remove `warDividendBps` and the minting logic from `executeRaid()` | `RaidEngine.sol` line 37, 171 | Not started |
| **Remove yield minting** | Remove `totalYieldMinted` and `harvestYield()` mint mechanic; replace with fee-funded rewards | `EconomyEngine.sol` line 54, 542 | Not started |
| **On-chain governance thresholds** | Add `proposalThreshold`, `quorumBps`, `passThresholdBps` state variables and enforce in `createProposal()` / `executeProposal()` | `GovernanceEngine.sol` | Not started |
| **Batch voting (gas savings)** | `batchCastVotes()` with `supportFlags` parameter | `GovernanceEngine.sol` | ✅ Completed |
| **Hash-bridge for text storage** | `bytes32` hashes for prophecy, proposal description, defection reason | `CultRegistry.sol`, `GovernanceEngine.sol` | ✅ Completed |
| **Agent-side hash callers** | `keccak256` hashing before on-chain writes | `CultAgent.ts`, `DefectionService.ts`, `GovernanceService.ts` | ✅ Completed |
| **Batch vote queue (agent)** | `pendingVotes` queue + `submitBatchVotes()` in `GovernanceService.ts` | `GovernanceService.ts` | ✅ Completed |
| **Nad.fun bonding curve launch** | Integrate Nad.fun SDK for token launch with configured parameters | `NadFunService.ts` | Partial (service exists) |

---

**END OF $CULT TOKEN DESIGN & TOKENOMICS DOCUMENT**

**Ready for Nad.fun Launch**
**Ready for Monad Mainnet**
**Ready to Power AgentCult**

---

_This document is subject to community feedback and may be updated before launch._
