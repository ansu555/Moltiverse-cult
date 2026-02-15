#!/usr/bin/env tsx
/**
 * Verify that on-chain follower counts match actual recruited agents
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { ContractService } from "../agent/src/chain/ContractService.js";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  🔍 VERIFYING FOLLOWER COUNTS MATCH ACTUAL AGENTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const client = getInsForgeClient();
  const contractService = new ContractService();

  // Get all agents grouped by cult
  const { data: allAgents } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("cult_id", { ascending: true });

  if (!allAgents) {
    console.error("❌ Failed to fetch agents");
    return;
  }

  // Group agents by cult
  const cultGroups = new Map<number, typeof allAgents>();
  for (const agent of allAgents) {
    if (agent.cult_id !== null && agent.cult_id >= 0) {
      if (!cultGroups.has(agent.cult_id)) {
        cultGroups.set(agent.cult_id, []);
      }
      cultGroups.get(agent.cult_id)!.push(agent);
    }
  }

  // Get on-chain data
  const onChainCults = await contractService.getAllCults();

  console.log("📊 COMPARISON: Database vs On-Chain\n");
  console.log("─".repeat(70));

  for (const [cultId, agents] of cultGroups) {
    const onChainCult = onChainCults.find(c => c.id === cultId);
    if (!onChainCult) continue;

    const agentCount = agents.length;
    const leaderCount = 1; // Assume first agent is the leader
    const followerCount = agentCount - leaderCount; // Everyone except leader
    const onChainFollowers = onChainCult.followerCount;

    console.log(`\n🏛️  Cult ${cultId}: ${onChainCult.name}`);
    console.log(`   Total agents in DB: ${agentCount}`);
    console.log(`   Expected followers: ${followerCount} (total agents - 1 leader)`);
    console.log(`   On-chain followers: ${onChainFollowers}`);

    if (followerCount === onChainFollowers) {
      console.log(`   Status: ✅ MATCH!`);
    } else {
      console.log(`   Status: ❌ MISMATCH! Off by ${Math.abs(followerCount - onChainFollowers)}`);
    }

    console.log(`\n   Agents in this cult:`);
    agents.forEach((a, idx) => {
      const role = idx === 0 ? "👑 Leader" : "👤 Follower";
      console.log(`      ${role}: ${a.name} (ID: ${a.id})`);
    });
  }

  console.log("\n" + "─".repeat(70));
  console.log("\n💡 NOTE: Each recruited agent should add +1 to follower count");
  console.log("   The leader is NOT counted as a follower.\n");

  // Check if we need to backfill
  let needsBackfill = false;
  for (const [cultId, agents] of cultGroups) {
    const onChainCult = onChainCults.find(c => c.id === cultId);
    if (!onChainCult) continue;

    const expectedFollowers = agents.length - 1;
    if (expectedFollowers !== onChainCult.followerCount) {
      needsBackfill = true;
      break;
    }
  }

  if (needsBackfill) {
    console.log("\n⚠️  BACKFILL NEEDED!");
    console.log("\nThe on-chain follower counts don't match the actual number of");
    console.log("recruited agents. This is because previous recordRecruitment()");
    console.log("calls failed due to permission issues (now fixed).\n");
    console.log("To fix this, we need to backfill the on-chain follower counts.");
  } else {
    console.log("\n✅ All follower counts are accurate!");
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
