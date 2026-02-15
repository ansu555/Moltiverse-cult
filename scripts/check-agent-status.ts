#!/usr/bin/env tsx
/**
 * Check current status of all agents in database
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";

async function main() {
  const client = getInsForgeClient();

  const { data, error } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("id");

  if (error) {
    console.error("❌ Failed to fetch agents:", error);
    process.exit(1);
  }

  console.log("\n📋 Current Agent Status:\n");
  data?.forEach((agent) => {
    const status = agent.cult_id === null ? "❌ INDEPENDENT" : `✅ Cult ${agent.cult_id}`;
    console.log(`   ID ${agent.id}: ${agent.name} → ${status}`);
  });
}

main().catch(console.error);
