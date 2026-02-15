#!/usr/bin/env tsx
/**
 * Bootstrap cults with initial treasury and followers
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
  "function depositToTreasury(uint256 cultId) payable",
  "function recordFollowerRecruitment(uint256 cultId, uint256 count) external",
];

const RPC_URL = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const REGISTRY_ADDRESS = process.env.CULT_REGISTRY_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

async function main() {
  console.log("\n" + "=".repeat(64));
  console.log("  🚀 Bootstrapping Cults with Initial Resources");
  console.log("=".repeat(64) + "\n");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, CULT_REGISTRY_ABI, wallet);

  console.log(`💰 Deployer wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} MON\n`);

  const totalCults = await registry.getTotalCults();
  console.log(`🏛️  Found ${totalCults} cults\n`);

  // Add treasury and followers to each cult
  for (let i = 0; i < Number(totalCults); i++) {
    const cult = await registry.getCult(i);
    console.log(`\n📦 Cult ${i}: ${cult.name}`);
    console.log(`   Current treasury: ${ethers.formatEther(cult.treasuryBalance)} MON`);
    console.log(`   Current followers: ${cult.followerCount}`);

    // Add 0.1 MON to treasury if below threshold
    if (cult.treasuryBalance < ethers.parseEther("0.1")) {
      const depositAmount = ethers.parseEther("0.1");
      console.log(`\n   💸 Depositing ${ethers.formatEther(depositAmount)} MON...`);
      
      try {
        const tx = await registry.depositToTreasury(i, { value: depositAmount });
        console.log(`   ⏳ TX: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Treasury deposit complete`);
      } catch (err: any) {
        console.log(`   ⚠️  Deposit failed: ${err.message}`);
      }
    } else {
      console.log(`   ✅ Treasury sufficient`);
    }

    // Add initial followers (10 each)
    if (cult.followerCount < 10) {
      console.log(`\n   👥 Adding 10 initial followers...`);
      
      try {
        const tx = await registry.recordFollowerRecruitment(i, 10);
        console.log(`   ⏳ TX: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Followers added`);
      } catch (err: any) {
        console.log(`   ⚠️  Failed to add followers: ${err.message}`);
      }
    } else {
      console.log(`   ✅ Followers sufficient`);
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log("  ✅ Bootstrap Complete");
  console.log("=".repeat(64) + "\n");

  // Show final state
  console.log("📊 Final State:\n");
  for (let i = 0; i < Number(totalCults); i++) {
    const cult = await registry.getCult(i);
    console.log(`  [${i}] ${cult.name}`);
    console.log(`      Treasury: ${ethers.formatEther(cult.treasuryBalance)} MON`);
    console.log(`      Followers: ${cult.followerCount}`);
    console.log();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
