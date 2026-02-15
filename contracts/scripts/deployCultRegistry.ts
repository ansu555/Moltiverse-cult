import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying CultRegistry with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  // Deploy CultRegistry
  const CultRegistry = await ethers.getContractFactory("CultRegistry");
  console.log("Deploying CultRegistry...");
  
  const registry = await CultRegistry.deploy();
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();
  console.log("✅ CultRegistry deployed to:", registryAddress);

  console.log("\n--- Update your .env file ---");
  console.log(`CULT_REGISTRY_ADDRESS=${registryAddress}`);
  console.log("-----------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
