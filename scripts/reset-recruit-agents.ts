#!/usr/bin/env tsx
/**
 * Reset recruit agents to independent status (cult_id = null)
 * so they become valid recruitment targets
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { createLogger } from "../agent/src/utils/logger.js";

const log = createLogger("ResetRecruits");

async function main() {
  console.log("\n🔄 Resetting recruit agents to independent status...\n");

  const client = getInsForgeClient();

  // IDs of recruit agents (created by seed-recruit-agents.ts)
  const recruitIds = [7, 8, 9, 10, 11];

  console.log("Recruit agent IDs:", recruitIds.join(", "));

  // Step 1: Delete their group memberships
  console.log("\n📝 Step 1: Removing group memberships...");
  const { error: deleteMembershipsError } = await client.database
    .from("group_memberships")
    .delete()
    .in("agent_id", recruitIds);

  if (deleteMembershipsError) {
    console.error("❌ Failed to delete group memberships:", deleteMembershipsError);
    process.exit(1);
  }
  console.log("✅ Group memberships deleted");

  // Step 2: Update all recruit agents to have cult_id = null
  console.log("\n📝 Step 2: Setting cult_id = null...");
  const { data, error } = await client.database
    .from("agents")
    .update({ cult_id: null })
    .in("id", recruitIds)
    .select("id, name, cult_id");

  if (error) {
    console.error("❌ Failed to reset recruit agents:", error);
    process.exit(1);
  }

  console.log("\n✅ Successfully reset recruit agents:\n");
  data?.forEach(agent => {
    console.log(`   ID ${agent.id}: ${agent.name} → cult_id = ${agent.cult_id}`);
  });

  console.log("\n📋 Next steps:");
  console.log("   1. Restart agent backend: cd agent && npm run dev");
  console.log("   2. Watch for recruitment attempts in logs");
  console.log("   3. Main cults should now find valid recruitment targets");
}

main().catch(console.error);
