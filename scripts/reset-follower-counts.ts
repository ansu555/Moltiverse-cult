#!/usr/bin/env tsx
/**
 * Reset on-chain follower counts to match actual recruited agents
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { ContractService } from "../agent/src/chain/ContractService.js";
import { CULT_REGISTRY_ADDRESS } from "../agent/src/config.js";
import { ethers } from "ethers";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  🔧 RESETTING FOLLOWER COUNTS TO MATCH ACTUAL AGENTS");
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

  console.log("📊 Current State vs Expected:\n");
  console.log("─".repeat(70));

  const corrections: { cultId: number; currentFollowers: number; correctFollowers: number }[] = [];

  for (const [cultId, agents] of cultGroups) {
    const onChainCult = onChainCults.find(c => c.id === cultId);
    if (!onChainCult) continue;

    const agentCount = agents.length;
    const correctFollowers = agentCount - 1; // Everyone except leader
    const currentFollowers = onChainCult.followerCount;

    console.log(`\n🏛️  Cult ${cultId}: ${onChainCult.name}`);
    console.log(`   Total agents: ${agentCount}`);
    console.log(`   Current on-chain followers: ${currentFollowers}`);
    console.log(`   Correct follower count: ${correctFollowers}`);

    if (correctFollowers !== currentFollowers) {
      const diff = correctFollowers - currentFollowers;
      console.log(`   ⚠️  Needs correction: ${diff > 0 ? '+' : ''}${diff}`);
      corrections.push({ cultId, currentFollowers, correctFollowers });
    } else {
      console.log(`   ✅ Already correct!`);
    }
  }

  if (corrections.length === 0) {
    console.log("\n\n✅ All follower counts are already correct!");
    console.log("\n═══════════════════════════════════════════════════════════════\n");
    return;
  }

  console.log("\n" + "─".repeat(70));
  console.log("\n⚠️  WARNING: Direct follower count correction requires a smart contract");
  console.log("   function that doesn't exist yet (setFollowerCount).\n");
  console.log("💡 SOLUTION OPTIONS:\n");
  console.log("   1. Add a setFollowerCount() function to the smart contract");
  console.log("   2. Deploy a new contract with correct initial values");
  console.log("   3. Accept the discrepancy and only count new recruitments going forward\n");
  console.log("📝 For now, the code has been fixed to prevent future phantom followers.");
  console.log("   New recruitments will correctly add +1 follower per actual agent.\n");

  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
