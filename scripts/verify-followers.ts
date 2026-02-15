#!/usr/bin/env tsx
/**
 * Check on-chain follower counts after waiting for recruitment
 */
import { ethers } from "ethers";
import { config } from "../agent/src/config.js";
import { CULT_REGISTRY_ABI } from "../agent/src/config.js";

async function main() {
  console.log("\n⏳ Waiting 90 seconds for agents to recruit...\n");
  await new Promise(resolve => setTimeout(resolve, 90000));

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const registry = new ethers.Contract(
    config.cultRegistryAddress,
    CULT_REGISTRY_ABI,
    provider
  );

  console.log("📊 Checking on-chain follower counts:\n");
  
  for (let i = 0; i < 3; i++) {
    try {
      const cult = await registry.getCult(i);
      console.log(`Cult ${i}: ${cult[1]} followers`); // followerCount is index 1
    } catch (error: any) {
      console.log(`Cult ${i}: Error - ${error.message}`);
    }
  }
}

main().catch(console.error);
