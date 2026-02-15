#!/usr/bin/env tsx
/**
 * Check if agent wallets match cult leaders on-chain
 */
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";
import { ContractService } from "../agent/src/chain/ContractService.js";

async function main() {
  const client = getInsForgeClient();
  const contractService = new ContractService();

  const { data: agents } = await client.database
    .from("agents")
    .select("id, name, cult_id, wallet_address")
    .in("cult_id", [0, 1, 2])
    .order("cult_id");

  console.log("\n🔍 Checking Cult Leadership:\n");
  console.log("─".repeat(80));

  let allMatch = true;

  for (const agent of agents || []) {
    const cult = await contractService.getCult(agent.cult_id!);
    const isLeader = cult.leader.toLowerCase() === agent.wallet_address.toLowerCase();

    if (!isLeader) allMatch = false;

    console.log(`\nCult ${agent.cult_id}: ${cult.name}`);
    console.log(`  Leader (contract): ${cult.leader}`);
    console.log(`  Agent wallet:      ${agent.wallet_address}`);
    console.log(`  Match: ${isLeader ? "✅ YES" : "❌ NO - THIS IS THE PROBLEM!"}`);
  }

  console.log("\n" + "─".repeat(80));

  if (!allMatch) {
    console.log("\n❌ PROBLEM FOUND!");
    console.log("\nThe agent wallets don't match the cult leaders on-chain.");
    console.log("This is why recordRecruitment() is failing - permission denied!\n");
    console.log("The contract requires onlyLeaderOrOwner(cultId) modifier.\n");
  } else {
    console.log("\n✅ All agent wallets match their cult leaders!");
    console.log("The permission issue is NOT the cause.\n");
  }
}

main().catch(console.error);
