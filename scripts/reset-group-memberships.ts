#!/usr/bin/env tsx
/**
 * Clear and reset group memberships to match actual cult IDs
 */

import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";

async function main() {
  console.log("\n🧹 CLEARING STALE GROUP MEMBERSHIPS\n");

  const client = getInsForgeClient();

  // Check current memberships
  console.log("📋 Current memberships:");
  const { data: oldMemberships } = await client.database
    .from("group_memberships")
    .select("*")
    .order("id", { ascending: true });

  if (oldMemberships && oldMemberships.length > 0) {
    console.table(oldMemberships);

    console.log("\n🗑️  Deleting all memberships...");
    const { error: deleteError } = await client.database
      .from("group_memberships")
      .delete()
      .neq("id", 0); // Delete all rows

    if (deleteError) {
      console.error("❌ Delete failed:", deleteError.message);
    } else {
      console.log("✅ All memberships cleared");
    }
  } else {
    console.log("(empty)\n");
  }

  // Get agents
  const { data: agents } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("id", { ascending: true });

  if (!agents || agents.length === 0) {
    console.log("⚠️  No agents found");
    return;
  }

  console.log("\n📝 Creating fresh memberships based on cult_id:\n");

  for (const agent of agents) {
    console.log(`  Creating membership for ${agent.name} → cult ${agent.cult_id}`);
    
    const { error } = await client.database
      .from("group_memberships")
      .insert({
        agent_id: agent.id,
        cult_id: agent.cult_id,
        role: "member",
        joined_at: Date.now(),
        active: true,
      });

    if (error) {
      console.log(`    ❌ Failed: ${error.message}`);
    } else {
      console.log(`    ✅ Created`);
    }
  }

  // Verify
  console.log("\n✅ Final memberships:");
  const { data: newMemberships } = await client.database
    .from("group_memberships")
    .select("*")
    .order("id", { ascending: true});

  if (newMemberships) {
    console.table(newMemberships);
  }

  console.log("\n✅✅✅ GROUP MEMBERSHIPS RESET! ✅✅✅");
  console.log("\n🚀 Restart the agent backend for changes to take effect\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
