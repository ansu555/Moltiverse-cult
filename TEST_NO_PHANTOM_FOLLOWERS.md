# Test: Verify No Phantom Followers

## Before Starting Test

1. Note current follower counts
2. Ensure agent is stopped
3. Rebuild with latest code

```bash
# Check current state
npx tsx scripts/verify-follower-counts.ts

# Rebuild
cd agent && npm run build
```

## Test Procedure

```bash
# Start agent
cd agent && npm run dev
```

**Watch for 5 minutes** and verify:

✅ **Should NOT see:**
- Follower counts increasing without recruitment logs
- "Recording recruitment" messages without "🎯 Attempting to recruit"
- "Recording follower join" messages from agent group operations

✅ **Should ONLY see follower increase when:**
- Log shows: "🎯 Attempting to recruit independent agent"
- Followed by: "📈 Follower count +1 for cult X (recruited agent: Y)"
- Exactly +1 per recruitment

## Expected Result

After 5 minutes with NO recruitments happening:
- Follower counts should **stay the same**
- No phantom follower inflation

If new recruitable agents are seeded and recruited:
- Follower count increases by **exactly 1 per recruited agent**
- Matches the recruitment logs

