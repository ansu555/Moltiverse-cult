import { expect } from "chai";
import { ethers } from "hardhat";

describe("RaidEngine", function () {
    let raidEngine: any;
    let registry: any;
    let owner: any;
    let other: any;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();

        const CultRegistry = await ethers.getContractFactory("CultRegistry");
        registry = await CultRegistry.deploy();
        await registry.waitForDeployment();

        const RaidEngine = await ethers.getContractFactory("RaidEngine");
        raidEngine = await RaidEngine.deploy(await registry.getAddress());
        await raidEngine.waitForDeployment();
    });

    describe("initiateRaid", function () {
        it("should resolve a raid with power calculation", async function () {
            const tx = await raidEngine.initiateRaid(
                0,  // attackerId
                1,  // defenderId
                ethers.parseEther("0.1"),  // wager
                ethers.parseEther("1.0"),  // attacker treasury
                5,   // attacker members
                ethers.parseEther("0.5"),  // defender treasury
                3,   // defender members
                42   // random seed
            );
            await tx.wait();

            const raid = await raidEngine.getRaid(0);
            expect(raid.attackerId).to.equal(0);
            expect(raid.defenderId).to.equal(1);
            expect(raid.wagerAmount).to.equal(ethers.parseEther("0.1"));
            expect(raid.timestamp).to.be.gt(0);
            expect(await raidEngine.totalRaids()).to.equal(1);
        });

        it("should not allow self-raids", async function () {
            await expect(
                raidEngine.initiateRaid(0, 0, 100, 1000, 5, 500, 3, 42)
            ).to.be.revertedWith("Cannot raid yourself");
        });

        it("should not allow zero wager", async function () {
            await expect(
                raidEngine.initiateRaid(0, 1, 0, 1000, 5, 500, 3, 42)
            ).to.be.revertedWith("Wager must be > 0");
        });

        it("should not allow wager exceeding treasury", async function () {
            await expect(
                raidEngine.initiateRaid(0, 1, 2000, 1000, 5, 500, 3, 42)
            ).to.be.revertedWith("Wager exceeds treasury");
        });

        it("should enforce cooldown between same-pair raids", async function () {
            await raidEngine.initiateRaid(0, 1, 100, 1000, 5, 500, 3, 42);

            await expect(
                raidEngine.initiateRaid(0, 1, 100, 1000, 5, 500, 3, 99)
            ).to.be.revertedWith("Raid on cooldown");
        });

        it("should allow raid after cooldown expires", async function () {
            await raidEngine.initiateRaid(0, 1, 100, 1000, 5, 500, 3, 42);

            // Advance past cooldown (2 minutes)
            await ethers.provider.send("evm_increaseTime", [121]);
            await ethers.provider.send("evm_mine", []);

            // Should succeed now
            await raidEngine.initiateRaid(0, 1, 100, 1000, 5, 500, 3, 99);
            expect(await raidEngine.totalRaids()).to.equal(2);
        });

        it("should only allow owner to initiate raids", async function () {
            await expect(
                raidEngine.connect(other).initiateRaid(0, 1, 100, 1000, 5, 500, 3, 42)
            ).to.be.revertedWith("Not owner");
        });
    });

    describe("spoils distribution", function () {
        it("should distribute 80/10/10 spoils", async function () {
            const wager = ethers.parseEther("1.0");
            await raidEngine.initiateRaid(0, 1, wager, ethers.parseEther("10"), 10, ethers.parseEther("5"), 5, 42);

            const raid = await raidEngine.getRaid(0);
            const expectedWinner = (wager * 8000n) / 10000n;
            const expectedProtocol = (wager * 1000n) / 10000n;
            const expectedBurn = wager - expectedWinner - expectedProtocol;

            expect(raid.spoilsToWinner).to.equal(expectedWinner);
            expect(raid.protocolFee).to.equal(expectedProtocol);
            expect(raid.burned).to.equal(expectedBurn);
        });

        it("should track per-cult win/loss stats", async function () {
            await raidEngine.initiateRaid(0, 1, 1000, 10000, 10, 5000, 5, 42);

            const raid = await raidEngine.getRaid(0);
            const winnerId = raid.attackerWon ? 0 : 1;
            const loserId = raid.attackerWon ? 1 : 0;

            const [wins] = await raidEngine.getCultStats(winnerId);
            expect(wins).to.equal(1);

            const [, losses] = await raidEngine.getCultStats(loserId);
            expect(losses).to.equal(1);
        });
    });

    describe("power calculation", function () {
        it("should compute Power = Treasury * 0.6 + Members * 100 * 0.4", async function () {
            // Power = 1000 * 0.6 + 5 * 100 * 0.4 = 600 + 200 = 800
            const power = await raidEngine.calculatePower(1000, 5);
            expect(power).to.equal(800);
        });

        it("should handle zero members", async function () {
            // Power = 1000 * 0.6 + 0 = 600
            const power = await raidEngine.calculatePower(1000, 0);
            expect(power).to.equal(600);
        });

        it("should handle zero treasury", async function () {
            // Power = 0 + 10 * 100 * 0.4 = 400
            const power = await raidEngine.calculatePower(0, 10);
            expect(power).to.equal(400);
        });
    });

    describe("cooldown management", function () {
        it("should report cooldown status correctly", async function () {
            expect(await raidEngine.isOnCooldown(0, 1)).to.be.false;

            await raidEngine.initiateRaid(0, 1, 100, 1000, 5, 500, 3, 42);
            expect(await raidEngine.isOnCooldown(0, 1)).to.be.true;

            // Advance past cooldown
            await ethers.provider.send("evm_increaseTime", [121]);
            await ethers.provider.send("evm_mine", []);
            expect(await raidEngine.isOnCooldown(0, 1)).to.be.false;
        });
    });

    describe("admin functions", function () {
        it("should allow owner to change cooldown duration", async function () {
            await raidEngine.setCooldownDuration(60);
            expect(await raidEngine.cooldownDuration()).to.equal(60);
        });

        it("should allow owner to change spoils distribution", async function () {
            await raidEngine.setSpoilsDistribution(6000, 3000, 1000);
            expect(await raidEngine.spoilsWinnerBps()).to.equal(6000);
            expect(await raidEngine.spoilsProtocolBps()).to.equal(3000);
        });

        it("should reject spoils that dont sum to 100%", async function () {
            await expect(
                raidEngine.setSpoilsDistribution(5000, 3000, 1000)
            ).to.be.revertedWith("Must sum to 100%");
        });
    });

    describe("view functions", function () {
        it("should return protocol stats", async function () {
            await raidEngine.initiateRaid(0, 1, 1000, 10000, 5, 5000, 3, 42);
            const [raids, fees, burned] = await raidEngine.getProtocolStats();
            expect(raids).to.equal(1);
            expect(fees).to.be.gt(0);
        });
    });
});
