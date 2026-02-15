import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("EconomyEngine", function () {
    let economy: any;
    let owner: any;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();
        const EconomyEngine = await ethers.getContractFactory("EconomyEngine");
        economy = await EconomyEngine.deploy();
        await economy.waitForDeployment();
    });

    describe("Treasury Initialization", function () {
        it("should initialize a treasury", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            const t = await economy.getTreasury(0);
            expect(t.balance).to.equal(ethers.parseEther("1.0"));
            expect(t.alive).to.equal(true);
        });

        it("should reject double initialization", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            await expect(
                economy.initTreasury(0, ethers.parseEther("2.0")),
            ).to.be.revertedWith("Already initialized");
        });
    });

    describe("Protocol Fees", function () {
        it("should collect 1% fee", async function () {
            const tx = await economy.collectFee(0, ethers.parseEther("10.0"));
            const receipt = await tx.wait();

            // 1% of 10 = 0.1
            expect(await economy.totalProtocolFees()).to.equal(ethers.parseEther("0.1"));
        });

        it("should reject fee > 5%", async function () {
            await expect(economy.setProtocolFeeBps(501)).to.be.revertedWith("Max 5%");
        });
    });

    describe("Tick Burn", function () {
        it("should burn operational cost per tick", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            await economy.applyTickBurn(0);

            const t = await economy.getTreasury(0);
            // Default burn rate = 5e13 = 0.00005 ETH
            expect(t.balance).to.equal(ethers.parseEther("1.0") - BigInt(5e13));
            expect(t.alive).to.equal(true);
        });

        it("should kill cult when treasury depleted", async function () {
            await economy.initTreasury(0, BigInt(50)); // tiny balance
            const tx = await economy.applyTickBurn(0);
            await tx.wait();

            const t = await economy.getTreasury(0);
            expect(t.balance).to.equal(0);
            expect(t.alive).to.equal(false);
            expect(await economy.totalDeaths()).to.equal(1);
        });
    });

    describe("Inflow / Outflow", function () {
        it("should track raid revenue", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            await economy.recordInflow(0, ethers.parseEther("0.5"), "raid");

            const t = await economy.getTreasury(0);
            expect(t.balance).to.equal(ethers.parseEther("1.5"));
            expect(await economy.raidRevenue(0)).to.equal(ethers.parseEther("0.5"));
        });

        it("should record outflow and check death", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            await economy.recordOutflow(0, ethers.parseEther("1.0"), "raid_wager");

            const t = await economy.getTreasury(0);
            expect(t.balance).to.equal(0);
            expect(t.alive).to.equal(false);
        });
    });

    describe("Rebirth", function () {
        it("should resurrect after cooldown", async function () {
            await economy.initTreasury(0, BigInt(50));
            await economy.applyTickBurn(0); // kills it

            // Advance time past cooldown (5 min)
            await time.increase(301);

            await economy.rebirth(0, ethers.parseEther("0.1"));
            const t = await economy.getTreasury(0);
            expect(t.alive).to.equal(true);
            expect(t.balance).to.equal(ethers.parseEther("0.1"));
        });

        it("should reject rebirth before cooldown", async function () {
            await economy.initTreasury(0, BigInt(50));
            await economy.applyTickBurn(0);

            await expect(
                economy.rebirth(0, ethers.parseEther("0.1")),
            ).to.be.revertedWith("Cooldown not over");
        });

        it("should reject rebirth below minimum funding", async function () {
            await economy.initTreasury(0, BigInt(50));
            await economy.applyTickBurn(0);
            await time.increase(301);

            await expect(
                economy.rebirth(0, BigInt(100)),
            ).to.be.revertedWith("Below minimum funding");
        });
    });

    describe("Analytics", function () {
        it("should estimate runway", async function () {
            await economy.initTreasury(0, BigInt(5e13) * BigInt(100)); // 100 ticks worth
            const runway = await economy.estimateRunway(0);
            expect(runway).to.equal(100);
        });

        it("should report canRebirth correctly", async function () {
            await economy.initTreasury(0, BigInt(50));
            await economy.applyTickBurn(0);

            expect(await economy.canRebirth(0)).to.equal(false);
            await time.increase(301);
            expect(await economy.canRebirth(0)).to.equal(true);
        });
    });

    describe("Selective Balance Visibility", function () {
        it("should grant and check view permissions", async function () {
            await economy.grantBalanceView(0, 1);
            expect(await economy.canViewBalance(0, 1)).to.equal(true);
            expect(await economy.canViewBalance(1, 0)).to.equal(false); // not symmetric
        });

        it("should revoke view permissions", async function () {
            await economy.grantBalanceView(0, 1);
            await economy.revokeBalanceView(0, 1);
            expect(await economy.canViewBalance(0, 1)).to.equal(false);
        });

        it("should return balance only with permission", async function () {
            await economy.initTreasury(0, ethers.parseEther("5.0"));

            // Without permission
            const [bal1, perm1] = await economy.getVisibleBalance(0, 1);
            expect(perm1).to.equal(false);
            expect(bal1).to.equal(0);

            // With permission
            await economy.grantBalanceView(0, 1);
            const [bal2, perm2] = await economy.getVisibleBalance(0, 1);
            expect(perm2).to.equal(true);
            expect(bal2).to.equal(ethers.parseEther("5.0"));
        });
    });

    describe("Fund Locking", function () {
        it("should lock and release funds", async function () {
            await economy.initTreasury(0, ethers.parseEther("10.0"));
            await economy.lockFunds(0, ethers.parseEther("3.0"), "raid_escrow");

            expect(await economy.lockedBalance(0)).to.equal(ethers.parseEther("3.0"));
            expect(await economy.getAvailableBalance(0)).to.equal(ethers.parseEther("7.0"));

            await economy.releaseFunds(0, ethers.parseEther("1.0"));
            expect(await economy.lockedBalance(0)).to.equal(ethers.parseEther("2.0"));
        });

        it("should reject locking more than available", async function () {
            await economy.initTreasury(0, ethers.parseEther("5.0"));
            await expect(
                economy.lockFunds(0, ethers.parseEther("6.0"), "too_much")
            ).to.be.revertedWith("Insufficient unlocked funds");
        });
    });

    describe("Inter-Cult Transfers", function () {
        it("should transfer funds between cults", async function () {
            await economy.initTreasury(0, ethers.parseEther("10.0"));
            await economy.initTreasury(1, ethers.parseEther("5.0"));

            await economy.transferFunds(0, 1, ethers.parseEther("3.0"), 0); // RAID_SPOILS

            const t0 = await economy.getTreasury(0);
            const t1 = await economy.getTreasury(1);
            expect(t0.balance).to.equal(ethers.parseEther("7.0"));
            expect(t1.balance).to.equal(ethers.parseEther("8.0"));
        });

        it("should kill source cult if fully drained", async function () {
            await economy.initTreasury(0, ethers.parseEther("1.0"));
            await economy.initTreasury(1, ethers.parseEther("1.0"));

            await economy.transferFunds(0, 1, ethers.parseEther("1.0"), 2); // TRIBUTE

            const t0 = await economy.getTreasury(0);
            expect(t0.alive).to.equal(false);
            expect(await economy.totalDeaths()).to.equal(1);
        });
    });
});
