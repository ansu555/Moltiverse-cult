# Verification Plan: `docs/CULT_Token_Design_and_Tokenomics.md` (Future-Target Baseline)

## Summary
- Verification scope is locked to **future target design** (not strict current-state conformance).
- Canonical defaults are locked: **100M supply**, **no post-launch minting**, **50/30/20 fee split**.
- Current doc is **not decision-consistent yet** due critical internal contradictions and unresolved implementation-gap framing.

## Verification Findings (Ordered by Severity)
1. **Critical: Minting model conflict with target economics**
- Doc says no minting post-launch: `docs/CULT_Token_Design_and_Tokenomics.md:177`, `docs/CULT_Token_Design_and_Tokenomics.md:623`.
- System contracts currently mint value via war dividends and yield: `contracts/contracts/RaidEngine.sol:37`, `contracts/contracts/RaidEngine.sol:171`, `contracts/contracts/EconomyEngine.sol:54`, `contracts/contracts/EconomyEngine.sol:542`.
- Action: mark these as deprecated mechanics in spec and define removal path in target architecture.

2. **Critical: Core governance rules are contradictory inside the tokenomics doc**
- Proposal threshold is `100 $CULT` in utility section: `docs/CULT_Token_Design_and_Tokenomics.md:109`.
- Proposal threshold is `100,000 $CULT` in governance section: `docs/CULT_Token_Design_and_Tokenomics.md:885`.
- Governance example fails its own threshold logic (`65%` marked as pass over `>66%`): `docs/CULT_Token_Design_and_Tokenomics.md:959`, `docs/CULT_Token_Design_and_Tokenomics.md:962`.

3. **Critical: Fee model has internal collision**
- Fee split says `50% burn / 30% stakers / 20% treasury`: `docs/CULT_Token_Design_and_Tokenomics.md:315`.
- POL section also allocates `20% of protocol fees` to LP buy/add: `docs/CULT_Token_Design_and_Tokenomics.md:665`.
- Action: redefine POL funding as a treasury policy (from the 20% treasury bucket), not an extra fee carveout.

4. **High: Token utility amounts conflict internally**
- Cult creation is `1,000 $CULT` in utility and appendix: `docs/CULT_Token_Design_and_Tokenomics.md:47`, `docs/CULT_Token_Design_and_Tokenomics.md:1693`.
- Fee table lists cult creation fee as `100 $CULT`: `docs/CULT_Token_Design_and_Tokenomics.md:300`.
- Action: keep **1,000 $CULT** canonical and update all references.

5. **High: Staking benefits conflict internally**
- Utility section tier benefits: `+10/+20/+50`: `docs/CULT_Token_Design_and_Tokenomics.md:97`.
- Staking mechanics section benefits: `+5/+10/+20`: `docs/CULT_Token_Design_and_Tokenomics.md:345`, `docs/CULT_Token_Design_and_Tokenomics.md:353`, `docs/CULT_Token_Design_and_Tokenomics.md:362`.
- Action: keep one tier schema only and remove duplicates.

6. **High: Vesting math inconsistency**
- Month 3-6 additions do not match stated circulating value: `docs/CULT_Token_Design_and_Tokenomics.md:262`, `docs/CULT_Token_Design_and_Tokenomics.md:265`.
- Action: replace static rounded claims with explicit unlock formulas and computed checkpoints.

7. **Medium: Cross-doc ecosystem inconsistency**
- Tokenomics doc uses 100M supply: `docs/CULT_Token_Design_and_Tokenomics.md:173`.
- Root README states 1B supply: `README.md:157`.
- Tokenomics doc headline says mainnet: `docs/CULT_Token_Design_and_Tokenomics.md:6`, while project docs/runtime are testnet-centric: `README.md:64`, `agent/src/config.ts:6`.

8. **Medium: Repo readiness blocker**
- Contract tests currently fail to compile due Solidity parser error at `contracts/contracts/GovernanceEngine.sol:179` (`supports` identifier), so implementation verification cannot fully pass until compile is restored.

## Important Public API / Interface / Type Changes to Lock in the Spec
1. **Cult registration funding interface**
- Target: replace MON-native funding flow (`registerCult(... ) payable`) with `$CULT`-denominated transfer logic.
- Current reference: `contracts/contracts/CultRegistry.sol:86`.

2. **Staking interface**
- Target: replace payable MON staking with ERC-20 `$CULT` staking and lock tiers.
- Current reference: `contracts/contracts/FaithStaking.sol:54`.

3. **Raid/Economy non-inflation invariants**
- Target: remove `warDividend` and yield mint mechanics from target interface contracts.
- Current references: `contracts/contracts/RaidEngine.sol:37`, `contracts/contracts/EconomyEngine.sol:54`.

4. **Governance interface**
- Target: encode proposal threshold, quorum, and pass threshold on-chain in governance methods.
- Current create/execute logic has no threshold/quorum: `contracts/contracts/GovernanceEngine.sol:111`, `contracts/contracts/GovernanceEngine.sol:239`.

5. **Contract set naming and deployment map**
- Tokenomics spec references planned contracts (`CULTToken.sol`, `TokenStaking.sol`, `FeeCollector.sol`, etc.): `docs/CULT_Token_Design_and_Tokenomics.md:1323`.
- Current deployment script deploys different set: `contracts/scripts/deploy.ts:10`.

## Documentation Update Execution Plan
1. Add a “**Target State vs Current State (as of February 14, 2026)**” section near the top so roadmap statements are explicitly non-live.
2. Normalize all canonical parameters across the doc:
- Supply `100,000,000`
- No post-launch minting
- Fee split `50/30/20`
- Cult creation fee `1,000`
- Governance threshold `100,000`, quorum `5%`, pass `66%`.
3. Rewrite conflicting sections (utility tiers, fee tables, governance examples, vesting checkpoints) so every repeated parameter appears once and references that canonical table.
4. Add a “**Migration Dependencies**” appendix mapping each planned tokenomics capability to required contract changes and status (`planned`, `partial`, `not started`).
5. Align external docs (`README.md`, docs module files) to avoid contradictory supply/network/token-denomination statements.

## Validation and Test Scenarios
1. **Doc consistency checks**
- No duplicate parameter with divergent values.
- Distribution percentages sum to 100%.
- Governance examples satisfy their own quorum/threshold math.
- Vesting checkpoints reconcile with unlock schedules.

2. **Cross-doc consistency checks**
- `README.md`, `docs/economy.md`, `docs/governance.md`, and tokenomics doc agree on supply, denomination, and fee split.

3. **Implementation-alignment checks (future-target readiness)**
- Contracts compile cleanly.
- Tests assert no mint paths when “no minting” mode is canonical.
- Tests assert exact fee split and governance threshold/quorum behavior.

## Assumptions and Defaults
- Verification baseline is **future target design** (chosen).
- Canonical tokenomics defaults are **100M supply**, **no minting**, **50/30/20 fee split** (chosen).
- Current MON-based mechanics are treated as transitional and must be explicitly labeled as such in documentation until migrated.
