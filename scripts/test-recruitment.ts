#!/usr/bin/env tsx
/**
 * Test recruitment system - verify agents are being recruited and follower counts increase
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { ContractService } from "../agent/src/chain/ContractService.js";
import { createLogger } from "../agent/src/utils/logger.js";

const log = createLogger("TestRecruitment");

async function main() {
  console.log("\n" + "═".repeat(80));
  console.log("  🧪 TESTING RECRUITMENT SYSTEM");
  console.log("═".repeat(80) + "\n");

  const client = getInsForgeClient();
  const contractService = new ContractService();

  // ===== STEP 1: Check current state =====
  console.log("📊 STEP 1: Checking Current State\n");
  console.log("-".repeat(80));

  const { data: allAgents, error: agentsError } = await client.database
    .from("agents")
    .select("id, name, cult_id, status, followers_recruited")
    .order("id");

  if (agentsError) {
    console.error("❌ Failed to fetch agents:", agentsError);
    process.exit(1);
  }

  const cultAgents = allAgents?.filter(a => a.cult_id !== null && a.cult_id >= 0) || [];
  const recruitableAgents = allAgents?.filter(a => a.cult_id === null && a.status !== "stopped") || [];

  console.log("\n🏛️  CULT AGENTS (can recruit):");
  if (cultAgents.length === 0) {
    console.log("   ⚠️  No cult agents found!");
  } else {
    cultAgents.forEach(a => {
      console.log(`   ID ${a.id}: ${a.name} → Cult ${a.cult_id} | Recruited: ${a.followers_recruited || 0}`);
    });
  }

  console.log("\n👤 RECRUITABLE AGENTS (cult_id = null):");
  if (recruitableAgents.length === 0) {
    console.log("   ⚠️  No recruitable agents found!");
    console.log("   💡 Run: npm run seed-recruits to create recruitable agents");
  } else {
    recruitableAgents.forEach(a => {
      console.log(`   ID ${a.id}: ${a.name} → cult_id = ${a.cult_id}`);
    });
  }

  // ===== STEP 2: Check on-chain follower counts =====
  console.log("\n\n📈 STEP 2: Checking On-Chain Follower Counts\n");
  console.log("-".repeat(80));

  const onChainCults = await contractService.getAllCults();

  console.log("\n⛓️  ON-CHAIN CULT DATA:");
  for (const cult of onChainCults) {
    if (cult.active) {
      const dbAgent = cultAgents.find(a => a.cult_id === cult.id);
      console.log(`   Cult ${cult.id}: ${cult.name}`);
      console.log(`      Followers: ${cult.followerCount}`);
      console.log(`      Treasury: ${cult.treasuryBalance.toString()} wei`);
      if (dbAgent) {
        console.log(`      Agent: ${dbAgent.name} (recruited ${dbAgent.followers_recruited || 0})`);
      }
    }
  }

  // ===== STEP 3: Check recent recruitment activity =====
  console.log("\n\n🔍 STEP 3: Checking Recent Recruitment Activity\n");
  console.log("-".repeat(80));

  // Check conversion events
  const { data: events, error: eventsError } = await client.database
    .from("conversion_events")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(10);

  if (eventsError) {
    console.warn("⚠️  Could not fetch conversion events:", eventsError.message);
  } else if (events && events.length > 0) {
    console.log("\n📜 Recent Conversion Events:");
    events.forEach((e, idx) => {
      const timestamp = new Date(e.timestamp).toLocaleString();
      console.log(`   ${idx + 1}. Cult ${e.cult_id} → Target ${e.target_cult_id}`);
      console.log(`      Converted: ${e.followers_converted} | Success: ${e.recorded_on_chain}`);
      console.log(`      Time: ${timestamp}`);
      console.log(`      Scripture: "${e.scripture?.slice(0, 80)}..."`);
    });
  } else {
    console.log("\n   ℹ️  No conversion events found yet");
  }

  // ===== STEP 4: Summary and recommendations =====
  console.log("\n\n" + "═".repeat(80));
  console.log("  📋 SUMMARY");
  console.log("═".repeat(80) + "\n");

  console.log(`✅ Total Agents: ${allAgents?.length || 0}`);
  console.log(`🏛️  Cult Agents (can recruit): ${cultAgents.length}`);
  console.log(`👤 Recruitable Agents (available): ${recruitableAgents.length}`);
  console.log(`⛓️  Active Cults on-chain: ${onChainCults.filter(c => c.active).length}`);
  console.log(`📜 Recent conversions: ${events?.length || 0}`);

  console.log("\n" + "─".repeat(80));

  if (recruitableAgents.length === 0) {
    console.log("\n⚠️  NO RECRUITABLE AGENTS FOUND!");
    console.log("\n📝 To fix this:");
    console.log("   1. Run: npm run seed-recruits");
    console.log("   2. Restart agent backend: cd agent && npm run dev");
    console.log("   3. Wait for agents to execute recruitment actions\n");
  } else if (cultAgents.length === 0) {
    console.log("\n⚠️  NO CULT AGENTS FOUND!");
    console.log("\n📝 To fix this:");
    console.log("   1. Make sure you have agents with cult_id set (0, 1, 2, etc.)");
    console.log("   2. Check database: SELECT id, name, cult_id FROM agents;\n");
  } else {
    console.log("\n✅ System looks ready for recruitment!");
    console.log("\n📝 Next steps:");
    console.log("   1. Ensure agent backend is running: cd agent && npm run dev");
    console.log("   2. Agents will automatically attempt recruitment during their cycles");
    console.log("   3. Monitor logs for recruitment messages:");
    console.log("      - Look for: '🎯 Attempting to recruit'");
    console.log("      - Look for: '✅ Successfully recruited'");
    console.log("      - Look for: '📈 Follower count increased'");
    console.log("   4. Re-run this script to verify follower counts are increasing\n");
    console.log("💡 You can also check specific agent logs in the agent backend output");
  }

  console.log("\n" + "═".repeat(80) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
