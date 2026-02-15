import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying CULTToken with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  // Deploy CULTToken (initial supply goes to deployer)
  console.log("\nDeploying CULTToken...");
  const CULTToken = await ethers.getContractFactory("CULTToken");
  const cultToken = await CULTToken.deploy(deployer.address);
  await cultToken.waitForDeployment();

  const cultTokenAddress = await cultToken.getAddress();
  console.log("✅ CULTToken deployed to:", cultTokenAddress);

  // If FaithStaking address exists in env, set it as staking pool
  const faithStakingAddress = process.env.FAITH_STAKING_ADDRESS;
  if (faithStakingAddress) {
    console.log("\nSetting staking pool to FaithStaking:", faithStakingAddress);
    const tx = await cultToken.setStakingPool(faithStakingAddress);
    await tx.wait();
    console.log("✅ Staking pool configured");
  } else {
    console.log("\n⚠️  FAITH_STAKING_ADDRESS not set - staking pool defaulting to owner");
  }

  console.log("\n--- Add this to your .env file ---");
  console.log(`CULT_TOKEN_ADDRESS=${cultTokenAddress}`);
  console.log("----------------------------------");
  console.log("\n📝 Next steps:");
  console.log("1. Copy the CULT_TOKEN_ADDRESS to your .env file");
  console.log("2. Set NEXT_PUBLIC_CULT_TOKEN_ADDRESS in frontend/.env.local");
  console.log("3. Restart the agent backend and frontend");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
