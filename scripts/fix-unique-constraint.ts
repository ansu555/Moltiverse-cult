#!/usr/bin/env tsx
/**
 * Drop unique constraint on agents.cult_id to allow multiple followers per cult
 * 
 * USAGE: Run this script, then restart agent backend
 */

async function main() {
  console.log("\n🔧 Fixing unique constraint on agents.cult_id...\n");
  console.log("⚠️  This requires using the InsForge MCP tool 'run-raw-sql'\n");
  console.log("SQL to execute:");
  console.log("─".repeat(60));
  console.log("DROP INDEX IF EXISTS agents_cult_id_key;");
  console.log("─".repeat(60));
  console.log("\n📋 Instructions:");
  console.log("1. Copy the SQL above");
  console.log("2. Ask Copilot to run it via MCP tool");
  console.log("3. Restart agent backend after successful execution");
  console.log("\nReason: Unique constraint prevents multiple agents from joining same cult");
}

main().catch(console.error);
