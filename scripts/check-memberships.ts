#!/usr/bin/env tsx
/**
 * Check group_memberships table for recruit agents
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";

async function main() {
  const client = getInsForgeClient();

  const { data, error } = await client.database
    .from("group_memberships")
    .select("id, agent_id, cult_id, active, join_reason")
    .in("agent_id", [7, 8, 9, 10, 11])
    .order("agent_id");

  if (error) {
    console.error("❌ Failed to fetch memberships:", error);
    process.exit(1);
  }

  console.log("\n📋 Group Memberships for Recruit Agents (IDs 7-11):\n");
  if (!data || data.length === 0) {
    console.log("   ✅ No memberships found (CORRECT - they should be independent)");
  } else {
    console.log("   ❌ PROBLEM: Found memberships that should have been deleted:\n");
    data?.forEach((m) => {
      console.log(`   ID ${m.id}: Agent ${m.agent_id} → Cult ${m.cult_id} (${m.active ? 'ACTIVE' : 'inactive'}) - ${m.join_reason}`);
    });
  }
}

main().catch(console.error);
