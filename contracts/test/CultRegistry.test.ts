import { expect } from "chai";
import { ethers } from "hardhat";
import { CultRegistry } from "../typechain-types";

describe("CultRegistry", function () {
  let registry: CultRegistry;
  let owner: any;
  let agent1: any;
  let agent2: any;
  let follower1: any;

  beforeEach(async function () {
    [owner, agent1, agent2, follower1] = await ethers.getSigners();
    const CultRegistry = await ethers.getContractFactory("CultRegistry");
    registry = await CultRegistry.deploy();
  });

  describe("registerCult", function () {
    it("should register a new cult", async function () {
      const tx = await registry.connect(agent1).registerCult(
        "Church of the Eternal Candle",
        "You are a mystical market prophet",
        ethers.ZeroAddress,
        { value: ethers.parseEther("0.1") }
      );
      await tx.wait();

      const cult = await registry.getCult(0);
      expect(cult.name).to.equal("Church of the Eternal Candle");
      expect(cult.leader).to.equal(agent1.address);
      expect(cult.treasuryBalance).to.equal(ethers.parseEther("0.1"));
      expect(cult.active).to.be.true;
    });

    it("should increment cult IDs", async function () {
      await registry.connect(agent1).registerCult("Cult A", "prompt A", ethers.ZeroAddress);
      await registry.connect(agent2).registerCult("Cult B", "prompt B", ethers.ZeroAddress);
      expect(await registry.getTotalCults()).to.equal(2);
    });
  });

  describe("joinCult", function () {
    it("should track followers", async function () {
      await registry.connect(agent1).registerCult("Test Cult", "prompt", ethers.ZeroAddress);
      await registry.connect(follower1).joinCult(0);
      const cult = await registry.getCult(0);
      expect(cult.followerCount).to.equal(1);
    });
  });

  describe("recordRaid", function () {
    it("should record raid results and transfer treasury", async function () {
      await registry.connect(agent1).registerCult("Attacker", "prompt", ethers.ZeroAddress, {
        value: ethers.parseEther("1"),
      });
      await registry.connect(agent2).registerCult("Defender", "prompt", ethers.ZeroAddress, {
        value: ethers.parseEther("1"),
      });

      // Attacker leader records raid - attacker wins 0.5 MON
      await registry.connect(agent1).recordRaid(0, 1, true, ethers.parseEther("0.5"));

      const attacker = await registry.getCult(0);
      const defender = await registry.getCult(1);
      expect(attacker.raidWins).to.equal(1);
      expect(defender.raidLosses).to.equal(1);
      expect(attacker.treasuryBalance).to.equal(ethers.parseEther("1.5"));
      expect(defender.treasuryBalance).to.equal(ethers.parseEther("0.5"));
    });

    it("should allow owner to record raids as override", async function () {
      await registry.connect(agent1).registerCult("A", "p", ethers.ZeroAddress);
      await registry.connect(agent2).registerCult("B", "p", ethers.ZeroAddress);
      await expect(
        registry.recordRaid(0, 1, true, 100)
      ).to.not.be.reverted;
    });

    it("should reject non-owner callers that are not attacker leader", async function () {
      await registry.connect(agent1).registerCult("A", "p", ethers.ZeroAddress);
      await registry.connect(agent2).registerCult("B", "p", ethers.ZeroAddress);
      await expect(
        registry.connect(follower1).recordRaid(0, 1, true, 100)
      ).to.be.revertedWith("Not authorized raider");
    });
  });

  describe("prophecies", function () {
    it("should create and resolve prophecies", async function () {
      await registry.connect(agent1).registerCult("Prophet Cult", "prompt", ethers.ZeroAddress, {
        value: ethers.parseEther("1"),
      });

      // Owner creates prophecy on behalf
      await registry.createProphecy(0, ethers.encodeBytes32String("ETH to 10k by EOW"), Math.floor(Date.now() / 1000) + 86400);

      // Resolve as correct with 1.5x multiplier
      await registry.resolveProphecy(0, true, 150);

      const cult = await registry.getCult(0);
      // 1 ETH + 50% bonus = 1.5 ETH
      expect(cult.treasuryBalance).to.equal(ethers.parseEther("1.5"));
    });
  });

  describe("getAllCults", function () {
    it("should return all cults", async function () {
      await registry.connect(agent1).registerCult("A", "p", ethers.ZeroAddress);
      await registry.connect(agent2).registerCult("B", "p", ethers.ZeroAddress);
      const all = await registry.getAllCults();
      expect(all.length).to.equal(2);
    });
  });

  describe("Agent Identity", function () {
    it("should register an agent identity", async function () {
      await registry.registerCult("TestCult", "prophecy", ethers.ZeroAddress);
      await registry.registerAgent(agent1.address, 0, 0); // LEADER role

      const agent = await registry.getAgent(agent1.address);
      expect(agent.active).to.equal(true);
      expect(agent.cultId).to.equal(0);
      expect(agent.reputation).to.equal(500);
      expect(await registry.isAgentRegistered(agent1.address)).to.equal(true);
    });

    it("should deactivate an agent", async function () {
      await registry.registerCult("TestCult", "prophecy", ethers.ZeroAddress);
      await registry.registerAgent(agent1.address, 0, 2); // FOLLOWER
      await registry.deactivateAgent(agent1.address, "expelled");
      expect(await registry.isAgentRegistered(agent1.address)).to.equal(false);
    });

    it("should update agent reputation", async function () {
      await registry.registerCult("TestCult", "prophecy", ethers.ZeroAddress);
      await registry.registerAgent(agent1.address, 0, 0);
      await registry.updateReputation(agent1.address, 900);

      const agent = await registry.getAgent(agent1.address);
      expect(agent.reputation).to.equal(900);
    });
  });

  describe("Anti-Sybil Minimum Stake", function () {
    it("should check minimum stake", async function () {
      await registry.registerCult("RichCult", "p", ethers.ZeroAddress);
      // Default treasury is 0, minimum stake is 0.01 ether
      expect(await registry.meetsMinimumStake(0)).to.equal(false);
    });

    it("should allow updating minimum stake", async function () {
      await registry.setMinimumStake(ethers.parseEther("0.05"));
      expect(await registry.minimumStake()).to.equal(ethers.parseEther("0.05"));
    });
  });
});
