import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  // Deploy CultRegistry
  const CultRegistry = await ethers.getContractFactory("CultRegistry");
  const registry = await CultRegistry.deploy();
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();
  console.log("CultRegistry deployed to:", registryAddress);

  // Deploy FaithStaking (linked to CultRegistry)
  const FaithStaking = await ethers.getContractFactory("FaithStaking");
  const staking = await FaithStaking.deploy(registryAddress);
  await staking.waitForDeployment();

  const stakingAddress = await staking.getAddress();
  console.log("FaithStaking deployed to:", stakingAddress);

  // Deploy GovernanceEngine (linked to CultRegistry)
  const GovernanceEngine = await ethers.getContractFactory("GovernanceEngine");
  const governance = await GovernanceEngine.deploy(registryAddress);
  await governance.waitForDeployment();

  const governanceAddress = await governance.getAddress();
  console.log("GovernanceEngine deployed to:", governanceAddress);

  // Deploy SocialGraph
  const SocialGraph = await ethers.getContractFactory("SocialGraph");
  const socialGraph = await SocialGraph.deploy();
  await socialGraph.waitForDeployment();

  const socialGraphAddress = await socialGraph.getAddress();
  console.log("SocialGraph deployed to:", socialGraphAddress);

  // Deploy EconomyEngine
  const EconomyEngine = await ethers.getContractFactory("EconomyEngine");
  const economyEngine = await EconomyEngine.deploy();
  await economyEngine.waitForDeployment();

  const economyAddress = await economyEngine.getAddress();
  console.log("EconomyEngine deployed to:", economyAddress);

  // Deploy RaidEngine (linked to CultRegistry)
  const RaidEngine = await ethers.getContractFactory("RaidEngine");
  const raidEngine = await RaidEngine.deploy(registryAddress);
  await raidEngine.waitForDeployment();

  const raidEngineAddress = await raidEngine.getAddress();
  console.log("RaidEngine deployed to:", raidEngineAddress);

  // Deploy EventEmitter
  const EventEmitter = await ethers.getContractFactory("EventEmitter");
  const eventEmitter = await EventEmitter.deploy();
  await eventEmitter.waitForDeployment();

  const eventEmitterAddress = await eventEmitter.getAddress();
  console.log("EventEmitter deployed to:", eventEmitterAddress);

  console.log("\n--- Update your .env file ---");
  console.log(`CULT_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`FAITH_STAKING_ADDRESS=${stakingAddress}`);
  console.log(`GOVERNANCE_ENGINE_ADDRESS=${governanceAddress}`);
  console.log(`SOCIAL_GRAPH_ADDRESS=${socialGraphAddress}`);
  console.log(`ECONOMY_ENGINE_ADDRESS=${economyAddress}`);
  console.log(`RAID_ENGINE_ADDRESS=${raidEngineAddress}`);
  console.log(`EVENT_EMITTER_ADDRESS=${eventEmitterAddress}`);
  console.log("-----------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
