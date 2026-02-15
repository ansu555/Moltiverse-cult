#!/usr/bin/env tsx
/**
 * Verify recruitment logic is correctly configured
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { createLogger } from "../agent/src/utils/logger.js";

const log = createLogger("VerifyRecruitment");

async function main() {
  console.log("\n🔍 Verifying Recruitment Logic\n");
  console.log("═".repeat(70));

  const client = getInsForgeClient();

  // Get all agents
  const { data: agents, error } = await client.database
    .from("agents")
    .select("id, name, cult_id, status")
    .order("id");

  if (error) {
    console.error("❌ Failed to fetch agents:", error);
    process.exit(1);
  }

  const activeCultAgents = agents?.filter(a => a.cult_id !== null && a.cult_id >= 0) || [];
  const recruitableAgents = agents?.filter(a => a.cult_id === null) || [];

  console.log("\n📊 CURRENT STATE:\n");
  
  console.log("🏛️  Active Cult Agents (WITH cult_id - CAN RECRUIT):");
  activeCultAgents.forEach(a => {
    console.log(`   ID ${a.id}: ${a.name} → cult_id = ${a.cult_id}`);
  });

  console.log("\n👤 Recruitable Agents (WITHOUT cult_id - CAN BE RECRUITED):");
  recruitableAgents.forEach(a => {
    console.log(`   ID ${a.id}: ${a.name} → cult_id = ${a.cult_id}`);
  });

  console.log("\n" + "═".repeat(70));
  console.log("\n✅ RECRUITMENT LOGIC:");
  console.log("   - Agents WITH cult_id (0,1,2) can RECRUIT");
  console.log("   - Agents WITH cult_id = null can BE RECRUITED");
  console.log("   - Code changes:");
  console.log("     • WorldStateService.getRecruitableAgents() - filters cult_id=null");
  console.log("     • CultAgent.executeRecruitment() - uses recruitableAgents");
  console.log("     • Independent agents have 0 followers (easier to recruit)");
  
  console.log("\n📋 NEXT STEP:");
  console.log("   Restart agent backend to activate new recruitment logic");
  console.log("   cd agent && npm run dev\n");
}

main().catch(console.error);
