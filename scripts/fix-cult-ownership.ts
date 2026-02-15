#!/usr/bin/env tsx
/**
 * Fix cult ownership - transfer cults to their agent wallets
 * OR update ContractService to use owner wallet for recordRecruitment
 */
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { CULT_REGISTRY_ADDRESS, CULT_ABI } from "../agent/src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  🔧 FIXING CULT OWNERSHIP");
  console.log("════════════════════════════════════════════════════════════════\n");

  const PRIVATE_KEY = process.env.PRIVATE_KEY!;
  const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

  // Get current owner wallet
  const ownerWallet = new ethers.Wallet(PRIVATE_KEY);
  console.log(`📋 Current Contract Owner: ${ownerWallet.address}\n`);

  // Get agent data
  const client = getInsForgeClient();
  const { data: agents } = await client.database
    .from("agents")
    .select("id, name, cult_id, wallet_address")
    .in("cult_id", [0, 1, 2])
    .order("cult_id");

  if (!agents || agents.length === 0) {
    console.log("❌ No cult agents found!");
    return;
  }

  console.log("📊 Current State:\n");
  agents.forEach((a) => {
    console.log(`   Cult ${a.cult_id}: ${a.name}`);
    console.log(`      Agent wallet: ${a.wallet_address}\n`);
  });

  console.log("═".repeat(70));
  console.log("\n💡 SOLUTION OPTIONS:\n");
  console.log("Option 1: Transfer cult leadership to agent wallets (RECOMMENDED)");
  console.log("   - Each cult owned by its agent");
  console.log("   - Agents can make their own contract calls");
  console.log("   - More decentralized\n");

  console.log("Option 2: Make ContractService use owner wallet for all calls");
  console.log("   - Centralized but simpler");
  console.log("   - All contract calls from one wallet\n");

  console.log("═".repeat(70));
  console.log("\n🔍 Checking if contract has transferLeadership function...\n");

  // Check contract ABI for transfer function
  const hasTransfer = CULT_ABI.some((item) =>
    typeof item === "string"
      ? item.includes("transferLeadership") || item.includes("transferOwnership")
      : item.name === "transferLeadership" || item.name === "transferOwnership"
  );

  if (hasTransfer) {
    console.log("✅ Contract supports leadership transfer!");
    console.log("\n📝 To transfer leadership, run:");
    console.log("   npx tsx scripts/transfer-cult-leadership.ts\n");
  } else {
    console.log("❌ Contract does NOT have transferLeadership function");
    console.log("\n📝 WORKAROUND: Update ContractService to use owner wallet\n");
    console.log("We need to modify ContractService.recordRecruitment() to:");
    console.log("   1. Use PRIVATE_KEY wallet instead of agent wallet");
    console.log("   2. Sign transactions with owner wallet\n");
  }

  console.log("═".repeat(70) + "\n");
}

main().catch(console.error);
