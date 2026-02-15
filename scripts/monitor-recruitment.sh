#!/bin/bash
# Monitor recruitment activity in real-time

echo "════════════════════════════════════════════════════════════════"
echo "  🔍 MONITORING RECRUITMENT ACTIVITY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "This script will show you when recruitment happens."
echo "Press Ctrl+C to stop monitoring."
echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""

# Start the agent in the background
cd agent
npm run dev 2>&1 | grep --line-buffered -E "recruit|Follower count|🎯|✅|📈|🔍 Found .* recruitable" &
AGENT_PID=$!

echo "✅ Agent backend started (PID: $AGENT_PID)"
echo ""
echo "Watching for recruitment events..."
echo "────────────────────────────────────────────────────────────────"
echo ""

# Wait for user to interrupt
trap "kill $AGENT_PID 2>/dev/null; echo ''; echo 'Stopped monitoring.'; exit 0" INT

wait $AGENT_PID
