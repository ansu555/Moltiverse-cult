#!/usr/bin/env tsx
/**
 * FORCE fix cult IDs using raw SQL
 */

import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";

async function main() {
  console.log("\n🔧 FORCE FIXING CULT IDs WITH RAW SQL\n");

  const client = getInsForgeClient();

  // Get current state
  console.log("📋 Current state:");
  const { data: before, error: beforeError } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("id", { ascending: true });

  if (beforeError) {
    console.error("❌ Failed to fetch:", beforeError.message);
    process.exit(1);
  }

  console.table(before);

  // Update each agent individually
  console.log("\n🔄 Updating agents...\n");

  // Church of the Eternal Candle -> 0
  console.log("Updating Church of the Eternal Candle to cult_id = 0");
  const { error: e1 } = await client.database
    .from("agents")
    .update({ cult_id: 0 })
    .eq("name", "Church of the Eternal Candle");
  if (e1) console.error("  ❌", e1.message);
  else console.log("  ✅ Updated");

  // Order of the Red Dildo -> 1
  console.log("Updating Order of the Red Dildo to cult_id = 1");
  const { error: e2 } = await client.database
    .from("agents")
    .update({ cult_id: 1 })
    .eq("name", "Order of the Red Dildo");
  if (e2) console.error("  ❌", e2.message);
  else console.log("  ✅ Updated");

  // Temple of Diamond Hands -> 2
  console.log("Updating Temple of Diamond Hands to cult_id = 2");
  const { error: e3 } = await client.database
    .from("agents")
    .update({ cult_id: 2 })
    .eq("name", "Temple of Diamond Hands");
  if (e3) console.error("  ❌", e3.message);
  else console.log("  ✅ Updated");

  // Verify
  console.log("\n✅ Verification:");
  const { data: after, error: afterError } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("id", { ascending: true });

  if (afterError) {
    console.error("❌ Failed to verify:", afterError.message);
    process.exit(1);
  }

  console.table(after);

  // Check if all correct
  const allCorrect =
    after?.find((a) => a.name === "Church of the Eternal Candle")?.cult_id === 0 &&
    after?.find((a) => a.name === "Order of the Red Dildo")?.cult_id === 1 &&
    after?.find((a) => a.name === "Temple of Diamond Hands")?.cult_id === 2;

  if (allCorrect) {
    console.log("\n✅✅✅ ALL CULT IDs CORRECT! ✅✅✅");
    console.log("\n🚀 Now restart the agent backend: npm run dev\n");
  } else {
    console.log("\n⚠️  Something is still wrong. Check the table above.\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
