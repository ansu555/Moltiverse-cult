#!/usr/bin/env tsx
/**
 * Fix cult ID mismatch between database and on-chain state
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const CULT_REGISTRY_ABI = [
  "function getCult(uint256 cultId) view returns (tuple(uint256 id, address leader, string name, string prophecyPrompt, address tokenAddress, uint256 treasuryBalance, uint256 followerCount, uint256 raidWins, uint256 raidLosses, uint256 createdAt, bool active))",
  "function getTotalCults() view returns (uint256)",
  "function leaderToCult(address leader) view returns (uint256)",
];

const RPC_URL = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const REGISTRY_ADDRESS = process.env.CULT_REGISTRY_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

if (!REGISTRY_ADDRESS) {
  console.error("❌ CULT_REGISTRY_ADDRESS not set in .env");
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY not set in .env");
  process.exit(1);
}

async function main() {
  console.log("\n" + "=".repeat(64));
  console.log("  🔍 Cult ID Mismatch Investigation");
  console.log("=".repeat(64) + "\n");

  // Setup provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, CULT_REGISTRY_ABI, wallet);

  console.log(`📡 Connected to: ${RPC_URL}`);
  console.log(`📜 Registry: ${REGISTRY_ADDRESS}`);
  console.log(`👤 Wallet: ${wallet.address}\n`);

  // Get total cults on-chain
  const totalCults = await registry.getTotalCults();
  console.log(`🏛️  Total cults on-chain: ${totalCults}\n`);

  if (totalCults === 0n) {
    console.log("⚠️  No cults found on-chain!");
    console.log("💡 Run the agent backend to bootstrap and register cults.\n");
    process.exit(0);
  }

  // Check each cult
  console.log("📊 On-chain cult data:\n");
  
  for (let i = 0; i < Number(totalCults); i++) {
    try {
      const cult = await registry.getCult(i);
      console.log(`  Cult ID ${i}:`);
      console.log(`    Name: ${cult.name}`);
      console.log(`    Leader: ${cult.leader}`);
      console.log(`    Treasury: ${ethers.formatEther(cult.treasuryBalance)} MON`);
      console.log(`    Followers: ${cult.followerCount}`);
      console.log(`    Active: ${cult.active}`);
      console.log(`    Created: ${new Date(Number(cult.createdAt) * 1000).toISOString()}`);
      console.log();
    } catch (err: any) {
      console.log(`  ❌ Cult ID ${i}: ${err.message}\n`);
    }
  }

  // Check what cult ID the deployer wallet has
  const deployerCultId = await registry.leaderToCult(wallet.address);
  console.log(`\n👤 Deployer wallet (${wallet.address}) cult ID: ${deployerCultId}`);

  // Now check InsForge DB
  console.log("\n" + "=".repeat(64));
  console.log("  🗄️  Checking InsForge Database");
  console.log("=".repeat(64) + "\n");

  try {
    const { createClient } = await import("@insforge/sdk");
    
    const insforgeClient = createClient({
      baseUrl: process.env.INSFORGE_BASE_URL || "https://3wcyg4ax.us-east.insforge.app",
      anonKey: process.env.INSFORGE_ANON_KEY || "",
    });

    const { data: agents, error } = await insforgeClient.database
      .from("agents")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.log(`❌ Failed to fetch agents from DB: ${error.message}`);
    } else if (!agents || agents.length === 0) {
      console.log("⚠️  No agents found in database!");
    } else {
      console.log(`📋 Found ${agents.length} agents in database:\n`);
      for (const agent of agents) {
        console.log(`  Agent ID ${agent.id}:`);
        console.log(`    Name: ${agent.name}`);
        console.log(`    Cult ID: ${agent.cult_id}`);
        console.log(`    Wallet: ${agent.wallet_address}`);
        console.log(`    Active: ${agent.active}`);
        console.log();
      }

      // Detect mismatches
      console.log("\n" + "=".repeat(64));
      console.log("  🔧 Mismatch Analysis");
      console.log("=".repeat(64) + "\n");

      let hasMismatch = false;
      for (const agent of agents) {
        if (agent.cult_id >= Number(totalCults)) {
          console.log(`⚠️  Agent "${agent.name}" (DB ID: ${agent.id})`);
          console.log(`    DB cult_id: ${agent.cult_id}`);
          console.log(`    On-chain max cult ID: ${Number(totalCults) - 1}`);
          console.log(`    ❌ MISMATCH: DB cult ID doesn't exist on-chain!\n`);
          hasMismatch = true;

          // Check if this wallet has a different cult on-chain
          try {
            const walletCultId = await registry.leaderToCult(agent.wallet_address);
            console.log(`    💡 This wallet's actual on-chain cult ID: ${walletCultId}`);
            
            if (walletCultId > 0n) {
              console.log(`    🔧 FIX: Update DB cult_id from ${agent.cult_id} to ${walletCultId}\n`);
              
              // Apply fix
              const { error: updateError } = await insforgeClient.database
                .from("agents")
                .update({ cult_id: Number(walletCultId) })
                .eq("id", agent.id);

              if (updateError) {
                console.log(`    ❌ Failed to update: ${updateError.message}\n`);
              } else {
                console.log(`    ✅ Updated agent ${agent.id} cult_id to ${walletCultId}\n`);
              }
            }
          } catch (err: any) {
            console.log(`    ⚠️  Could not check wallet's cult: ${err.message}\n`);
          }
        }
      }

      if (!hasMismatch) {
        console.log("✅ No mismatches found! All DB cult IDs match on-chain state.\n");
      }
    }
  } catch (err: any) {
    console.log(`❌ Failed to check InsForge DB: ${err.message}\n`);
  }

  console.log("=".repeat(64));
  console.log("  ✅ Investigation Complete");
  console.log("=".repeat(64) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
