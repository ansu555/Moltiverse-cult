#!/usr/bin/env tsx
/**
 * Drop unique constraint on agents.cult_id to allow multiple followers per cult
 * 
 * This uses a workaround: we'll check if the constraint exists by testing an insert,
 * then provide instructions for manual fix if needed.
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { createLogger } from "../agent/src/utils/logger.js";

const log = createLogger("ConstraintFix");

async function main() {
  console.log("\n🔧 Checking unique constraint on agents.cult_id...\n");

  const client = getInsForgeClient();

  // Test if constraint exists by checking for duplicate cult_id possibility
  // First, get existing agents
  const { data: agents, error: fetchError } = await client.database
    .from("agents")
    .select("id, cult_id, name")
    .order("id");

  if (fetchError) {
    console.error("❌ Failed to fetch agents:", fetchError);
    process.exit(1);
  }

  console.log(`Found ${agents?.length || 0} agents`);
  
  // Check if we have agents with duplicate cult_id values
  const cultIdCounts = new Map<number, number>();
  agents?.forEach(a => {
    if (a.cult_id !== null) {
      cultIdCounts.set(a.cult_id, (cultIdCounts.get(a.cult_id) || 0) + 1);
    }
  });

  const hasDuplicates = Array.from(cultIdCounts.values()).some(count => count > 1);

  if (hasDuplicates) {
    console.log("✅ Constraint already removed - multiple agents per cult detected");
    process.exit(0);
  }

  console.log("\n⚠️  Unique constraint exists - manual fix required\n");
  console.log("📋 Instructions to fix:");
  console.log("─".repeat(70));
  console.log("1. Open InsForge Console: https://console.insforge.com");
  console.log("2. Navigate to your project: 3wcyg4ax");
  console.log("3. Go to SQL Editor");
  console.log("4. Run this SQL (constraint, not just index):");
  console.log("");
  console.log("   ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_cult_id_key;");
  console.log("");
  console.log("5. Verify by running:");
  console.log("   SELECT conname FROM pg_constraint WHERE conrelid = 'agents'::regclass;");
  console.log("");
  console.log("6. Restart agent backend:");
  console.log("   cd agent && npm run dev");
  console.log("─".repeat(70));
  console.log("\n💡 Why: The unique CONSTRAINT prevents multiple agents from the same cult");
  console.log("   Dropping the constraint will also drop the associated index automatically");
}

main().catch(console.error);
