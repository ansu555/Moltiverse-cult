#!/usr/bin/env tsx
/**
 * Sync cult IDs: Match DB agents to their on-chain cults by name
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getInsForgeClient, updateAgentState } from "../agent/src/services/InsForgeService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const CULT_REGISTRY_ABI = [
  "function getCult(uint256 cultId) view returns (tuple(uint256 id, address leader, string name, string prophecyPrompt, address tokenAddress, uint256 treasuryBalance, uint256 followerCount, uint256 raidWins, uint256 raidLosses, uint256 createdAt, bool active))",
  "function getTotalCults() view returns (uint256)",
];

const RPC_URL = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const REGISTRY_ADDRESS = process.env.CULT_REGISTRY_ADDRESS!;

if (!REGISTRY_ADDRESS) {
  console.error("❌ CULT_REGISTRY_ADDRESS not set in .env");
  process.exit(1);
}

async function main() {
  console.log("\n" + "=".repeat(64));
  console.log("  🔄 Syncing Cult IDs (DB ↔ On-Chain)");
  console.log("=".repeat(64) + "\n");

  // Setup provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, CULT_REGISTRY_ABI, provider);

  // Get on-chain cults
  const totalCults = await registry.getTotalCults();
  console.log(`🏛️  Found ${totalCults} cults on-chain\n`);

  const onChainCults = [];
  for (let i = 0; i < Number(totalCults); i++) {
    const cult = await registry.getCult(i);
    onChainCults.push({
      id: i,
      name: cult.name,
      leader: cult.leader,
      active: cult.active,
    });
    console.log(`  [${i}] ${cult.name} (${cult.active ? "active" : "inactive"})`);
  }
  console.log();

  // Get DB agents
  const client = getInsForgeClient();
  const { data: agents, error } = await client.database
    .from("agents")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error(`❌ Failed to fetch agents: ${error.message}`);
    process.exit(1);
  }

  if (!agents || agents.length === 0) {
    console.log("⚠️  No agents in database");
    process.exit(0);
  }

  console.log(`📋 Found ${agents.length} agents in database\n`);

  // Match by name
  console.log("🔗 Matching agents to cults by name:\n");
  
  let updateCount = 0;
  for (const agent of agents) {
    const matchingCult = onChainCults.find(
      (c) => c.name.toLowerCase() === agent.name.toLowerCase()
    );

    if (matchingCult) {
      console.log(`  ✅ "${agent.name}"`);
      console.log(`     DB cult_id: ${agent.cult_id} → ${matchingCult.id}`);
      
      if (agent.cult_id !== matchingCult.id) {
        // Update DB
        try {
          await updateAgentState(agent.id, {
            cult_id: matchingCult.id,
          });
          console.log(`     ✅ Updated to cult ID ${matchingCult.id}`);
          updateCount++;
        } catch (err: any) {
          console.log(`     ⚠️  Update failed: ${err.message}`);
        }
      } else {
        console.log(`     ℹ️  Already correct`);
      }
    } else {
      console.log(`  ⚠️  "${agent.name}" - No matching on-chain cult found`);
    }
    console.log();
  }

  console.log("=".repeat(64));
  console.log(`  ✅ Sync Complete: ${updateCount} agent(s) updated`);
  console.log("=".repeat(64) + "\n");

  // Verify
  console.log("🔍 Verification:\n");
  const { data: updatedAgents } = await client.database
    .from("agents")
    .select("*")
    .order("id", { ascending: true });

  if (updatedAgents) {
    for (const agent of updatedAgents) {
      const onChainCult = onChainCults.find((c) => c.id === agent.cult_id);
      const status = onChainCult ? "✅" : "❌";
      console.log(`  ${status} Agent: ${agent.name}`);
      console.log(`     DB cult_id: ${agent.cult_id}`);
      console.log(`     On-chain: ${onChainCult ? onChainCult.name : "NOT FOUND"}`);
      console.log();
    }
  }

  console.log("✅ Done! Restart the agent backend for changes to take effect.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
