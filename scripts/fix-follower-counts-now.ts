#!/usr/bin/env tsx
/**
 * Fix follower counts to match actual agents
 * Uses the new setFollowerCount admin function
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const ABI = [
  "function setFollowerCount(uint256 cultId, uint256 count)",
  "function getCult(uint256 cultId) view returns (tuple(uint256 id, address leader, string name, string prophecyPrompt, address tokenAddress, uint256 treasuryBalance, uint256 followerCount, uint256 raidWins, uint256 raidLosses, uint256 createdAt, bool active))",
];

async function main() {
  console.log("\n🔧 FIXING FOLLOWER COUNTS\n");

  const client = getInsForgeClient();
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://localhost:8545");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const registry = new ethers.Contract(process.env.CULT_REGISTRY_ADDRESS!, ABI, wallet);

  // Get agents grouped by cult
  const { data: allAgents } = await client.database
    .from("agents")
    .select("id, name, cult_id")
    .order("cult_id");

  const cultGroups = new Map<number, typeof allAgents>();
  for (const agent of allAgents || []) {
    if (agent.cult_id !== null && agent.cult_id >= 0) {
      if (!cultGroups.has(agent.cult_id)) {
        cultGroups.set(agent.cult_id, []);
      }
      cultGroups.get(agent.cult_id)!.push(agent);
    }
  }

  for (const [cultId, agents] of cultGroups) {
    const correctCount = agents.length - 1; // Exclude leader
    const currentCult = await registry.getCult(cultId);
    const currentCount = Number(currentCult.followerCount);

    console.log(`\nCult ${cultId}: ${currentCult.name}`);
    console.log(`  Current: ${currentCount} followers`);
    console.log(`  Correct: ${correctCount} followers`);

    if (currentCount !== correctCount) {
      console.log(`  ⚙️  Fixing...`);
      const tx = await registry.setFollowerCount(cultId, correctCount);
      await tx.wait();
      console.log(`  ✅ Fixed! Set to ${correctCount}`);
    } else {
      console.log(`  ✅ Already correct`);
    }
  }

  console.log("\n✅ All follower counts fixed!\n");
}

main().catch(console.error);
