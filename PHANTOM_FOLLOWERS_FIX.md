# Phantom Followers Fix ✅

## Problem Identified

The recruitment system was adding **phantom followers** that didn't correspond to actual agents:

- **Cult 0**: 2 actual agents, but 21 followers on-chain (+19 phantom)
- **Cult 1**: 2 actual agents, but 16 followers on-chain (+14 phantom)
- **Cult 2**: 4 actual agents, but 36 followers on-chain (+32 phantom)

### Root Cause

The `PersuasionService.attemptConversion()` function was:
1. Calculating a random number of "converted followers" (1-5) using a persuasion formula
2. Calling `recordRecruitment()` to add these phantom followers on-chain
3. Then `CultAgent.executeRecruitment()` ALSO called `recordRecruitment()` for the actual agent

This resulted in **double counting** plus random phantom followers.

## Fix Applied

### 1. Removed Phantom Follower Recording

**Modified: [PersuasionService.ts](agent/src/services/PersuasionService.ts)**
- Removed the `recordRecruitment()` call from `attemptConversion()`
- Removed the persuasion formula calculations
- Now only generates scripture for narrative/lore purposes
- `followersConverted` is always set to `0`
- `recordedOnChain` is always `false`

```typescript
// BEFORE: Added 1-5 phantom followers
await this.contractService.recordRecruitment(cultId, followersConverted);

// AFTER: No on-chain recording - scripture is for lore only
log.info('Generated persuasion scripture (lore only)');
```

### 2. Clarified Agent Recruitment

**Modified: [CultAgent.ts:581-612](agent/src/core/CultAgent.ts#L581-L612)**
- Added comments clarifying that `attemptConversion()` is for lore only
- Only `executeRecruitment()` calls `recordRecruitment(cultId, 1)` for actual agents
- Improved logging to show which agent was recruited

```typescript
// Increment follower count on-chain by exactly 1 (for this recruited agent)
const service = this.ownerContractService || this.contractService;
await service.recordRecruitment(this.cultId, 1);
this.log.info(`📈 Follower count +1 for cult ${this.cultId} (recruited agent: ${target.name})`);
```

## Current State

### What's Fixed ✅
- **No more phantom followers** will be added going forward
- Each recruited agent now correctly adds exactly **+1 follower**
- Follower counts will accurately reflect actual recruited agents
- Permission issues fixed (using owner wallet for privileged ops)

### Legacy Discrepancy ⚠️
The existing inflated follower counts remain on-chain because:
- Smart contract doesn't have a `setFollowerCount()` function
- Can't directly reset values without contract modification

**Options:**
1. **Accept it**: Live with the discrepancy, new recruitments will be accurate
2. **Deploy new contract**: Start fresh with correct values
3. **Add admin function**: Update contract to allow owner to reset counts

## Verification

Run these scripts to verify the fix:

```bash
# Check current follower counts vs actual agents
npx tsx scripts/verify-follower-counts.ts

# Test recruitment (ensure it adds +1 per agent)
npx tsx scripts/test-recruitment.ts

# Seed new recruitable agents for testing
npx tsx scripts/seed-recruit-agents.ts
```

## Summary

**Before:**
- Phantom followers being added randomly (1-5 per recruitment attempt)
- Double counting (persuasion + actual recruitment)
- Follower counts = 65+ phantom followers across all cults

**After:**
- ✅ Only actual recruited agents count as followers
- ✅ Each recruitment = exactly +1 follower
- ✅ Database and on-chain will match for new recruitments
- ⚠️ Legacy phantom followers remain (harmless, just inflated numbers)

---

**Files Modified:**
- [agent/src/services/PersuasionService.ts](agent/src/services/PersuasionService.ts)
- [agent/src/core/CultAgent.ts](agent/src/core/CultAgent.ts)

**Last Updated:** 2026-02-15
