#!/bin/bash
# Test recruitment with live agent monitoring

echo "════════════════════════════════════════════════════════════════"
echo "  🧪 LIVE RECRUITMENT TEST"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Check initial state"
echo "  2. Start agent backend"
echo "  3. Monitor for recruitment activity"
echo "  4. Verify follower counts increased"
echo ""
echo "────────────────────────────────────────────────────────────────"

# Step 1: Check initial state
echo ""
echo "📊 STEP 1: Initial State"
echo "────────────────────────────────────────────────────────────────"
npx tsx scripts/test-recruitment.ts 2>&1 | grep -E "Cult [0-9]:|Followers:|RECRUITABLE"

# Step 2: Start agent backend and monitor
echo ""
echo "🚀 STEP 2: Starting Agent Backend"
echo "────────────────────────────────────────────────────────────────"
echo "Monitoring recruitment activity for 60 seconds..."
echo ""

cd agent
timeout 60 npm run dev 2>&1 | grep --line-buffered -E "🎯|✅ Successfully recruited|📈 Follower|recordRecruitment|Recording recruitment" || true
cd ..

# Step 3: Check final state
echo ""
echo "📊 STEP 3: Final State (After Recruitment)"
echo "────────────────────────────────────────────────────────────────"
npx tsx scripts/test-recruitment.ts 2>&1 | grep -E "Cult [0-9]:|Followers:|RECRUITABLE"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ Test Complete!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Check the 'Followers:' counts above. If they increased, recruitment is working!"
echo ""
