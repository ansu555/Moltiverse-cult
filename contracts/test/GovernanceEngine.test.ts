import { expect } from "chai";
import { ethers } from "hardhat";

describe("GovernanceEngine", function () {
    let governance: any;
    let registry: any;
    let owner: any;
    let voter1: any;
    let voter2: any;
    let voter3: any;

    beforeEach(async function () {
        [owner, voter1, voter2, voter3] = await ethers.getSigners();

        // Deploy CultRegistry first (needed as dependency)
        const CultRegistry = await ethers.getContractFactory("CultRegistry");
        registry = await CultRegistry.deploy();

        const GovernanceEngine = await ethers.getContractFactory("GovernanceEngine");
        governance = await GovernanceEngine.deploy(await registry.getAddress());
    });

    describe("createProposal", function () {
        it("should create a valid budget proposal", async function () {
            const tx = await governance.createProposal(
                0, // cultId
                40, // raid %
                30, // growth %
                20, // defense %
                10, // reserve %
                ethers.encodeBytes32String("Aggressive raid strategy")
            );
            await tx.wait();

            const proposal = await governance.getProposal(0);
            expect(proposal.raidPercent).to.equal(40);
            expect(proposal.growthPercent).to.equal(30);
            expect(proposal.defensePercent).to.equal(20);
            expect(proposal.reservePercent).to.equal(10);
            expect(proposal.descriptionHash).to.equal(ethers.encodeBytes32String("Aggressive raid strategy"));
            expect(proposal.status).to.equal(0); // ACTIVE
        });

        it("should reject budgets that dont sum to 100", async function () {
            await expect(
                governance.createProposal(0, 50, 30, 20, 20, ethers.encodeBytes32String("Bad math"))
            ).to.be.revertedWith("Budget must sum to 100%");
        });

        it("should limit active proposals to 5 per cult", async function () {
            for (let i = 0; i < 5; i++) {
                await governance.createProposal(0, 25, 25, 25, 25, ethers.encodeBytes32String(`Proposal ${i}`));
            }
            await expect(
                governance.createProposal(0, 25, 25, 25, 25, ethers.encodeBytes32String("One too many"))
            ).to.be.revertedWith("Too many active proposals");
        });
    });

    describe("castVote", function () {
        beforeEach(async function () {
            await governance.createProposal(0, 40, 30, 20, 10, ethers.encodeBytes32String("Test proposal"));
        });

        it("should allow voting with weight", async function () {
            await governance.connect(voter1).castVote(0, true, 100);
            const proposal = await governance.getProposal(0);
            expect(proposal.votesFor).to.equal(100);
        });

        it("should track against votes", async function () {
            await governance.connect(voter1).castVote(0, false, 50);
            const proposal = await governance.getProposal(0);
            expect(proposal.votesAgainst).to.equal(50);
        });

        it("should prevent double voting", async function () {
            await governance.connect(voter1).castVote(0, true, 100);
            await expect(
                governance.connect(voter1).castVote(0, true, 100)
            ).to.be.revertedWith("Already voted");
        });

        it("should aggregate multiple voter weights", async function () {
            await governance.connect(voter1).castVote(0, true, 100);
            await governance.connect(voter2).castVote(0, true, 200);
            await governance.connect(voter3).castVote(0, false, 150);

            const proposal = await governance.getProposal(0);
            expect(proposal.votesFor).to.equal(300);
            expect(proposal.votesAgainst).to.equal(150);
        });
    });

    describe("executeProposal", function () {
        beforeEach(async function () {
            // Set voting duration to 60 seconds for testing
            await governance.setVotingDuration(60);
            await governance.createProposal(0, 50, 20, 20, 10, ethers.encodeBytes32String("Raid-heavy budget"));
        });

        it("should pass proposal with majority for-votes", async function () {
            await governance.connect(voter1).castVote(0, true, 200);
            await governance.connect(voter2).castVote(0, false, 100);

            // Wait for voting to end
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await governance.executeProposal(0);

            const proposal = await governance.getProposal(0);
            expect(proposal.status).to.equal(1); // PASSED

            const budget = await governance.getBudget(0);
            expect(budget.raidPercent).to.equal(50);
            expect(budget.growthPercent).to.equal(20);
        });

        it("should reject proposal with majority against-votes", async function () {
            await governance.connect(voter1).castVote(0, true, 50);
            await governance.connect(voter2).castVote(0, false, 200);

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await governance.executeProposal(0);

            const proposal = await governance.getProposal(0);
            expect(proposal.status).to.equal(2); // REJECTED
        });

        it("should not execute before voting ends", async function () {
            await governance.connect(voter1).castVote(0, true, 100);
            await expect(governance.executeProposal(0)).to.be.revertedWith(
                "Voting not ended"
            );
        });
    });

    describe("view functions", function () {
        it("should return all cult proposals", async function () {
            await governance.createProposal(0, 25, 25, 25, 25, ethers.encodeBytes32String("A"));
            await governance.createProposal(0, 50, 20, 20, 10, ethers.encodeBytes32String("B"));

            const all = await governance.getAllCultProposals(0);
            expect(all.length).to.equal(2);
        });

        it("should track proposal count per cult", async function () {
            await governance.createProposal(0, 25, 25, 25, 25, ethers.encodeBytes32String("Cult 0"));
            await governance.createProposal(1, 40, 30, 20, 10, ethers.encodeBytes32String("Cult 1"));

            expect(await governance.getCultProposalCount(0)).to.equal(1);
            expect(await governance.getCultProposalCount(1)).to.equal(1);
        });
    });

    describe("Bribery System", function () {
        beforeEach(async function () {
            await governance.createProposal(0, 40, 30, 20, 10, ethers.encodeBytes32String("Bribe target proposal"));
        });

        it("should offer and accept a bribe", async function () {
            // Owner offers bribe to voter1
            await governance.offerBribe(0, voter1.address, 100, true);
            const bribe = await governance.getBribe(0);
            expect(bribe.target).to.equal(voter1.address);
            expect(bribe.amount).to.equal(100);
            expect(bribe.status).to.equal(0); // PENDING

            // voter1 accepts, auto-votes
            await governance.connect(voter1).acceptBribe(0);
            const bribeAfter = await governance.getBribe(0);
            expect(bribeAfter.status).to.equal(1); // ACCEPTED

            const proposal = await governance.getProposal(0);
            expect(proposal.votesFor).to.equal(1); // auto-voted
        });

        it("should not allow self-bribery", async function () {
            await expect(
                governance.offerBribe(0, owner.address, 100, true)
            ).to.be.revertedWith("Cannot bribe yourself");
        });

        it("should reveal bribes after voting ends", async function () {
            await governance.setVotingDuration(60);
            await governance.createProposal(0, 25, 25, 25, 25, ethers.encodeBytes32String("Reveal test"));
            await governance.offerBribe(1, voter1.address, 50, true);
            await governance.connect(voter1).acceptBribe(0);

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await governance.revealBribes(1);
            const bribe = await governance.getBribe(0);
            expect(bribe.status).to.equal(3); // REVEALED
        });
    });

    describe("Leadership Elections", function () {
        beforeEach(async function () {
            await governance.setVotingDuration(60);
        });

        it("should propose and execute a leadership change", async function () {
            await governance.proposeLeadershipVote(0, voter2.address);
            const proposal = await governance.getLeadershipProposal(0);
            expect(proposal.candidate).to.equal(voter2.address);
            expect(proposal.status).to.equal(0); // ACTIVE

            // Vote for the new leader
            await governance.connect(voter1).voteForLeader(0, true, 100, false);
            await governance.connect(voter2).voteForLeader(0, true, 50, false);
            await governance.connect(voter3).voteForLeader(0, false, 30, false);

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await governance.executeLeadershipChange(0);
            const proposalAfter = await governance.getLeadershipProposal(0);
            expect(proposalAfter.status).to.equal(1); // PASSED
        });

        it("should reject leadership change with insufficient votes", async function () {
            await governance.proposeLeadershipVote(0, voter2.address);
            await governance.connect(voter1).voteForLeader(0, false, 200, false);

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await governance.executeLeadershipChange(0);
            const proposal = await governance.getLeadershipProposal(0);
            expect(proposal.status).to.equal(2); // REJECTED
        });
    });

    describe("Leader Vote Weight", function () {
        beforeEach(async function () {
            await governance.createProposal(0, 40, 30, 20, 10, ethers.encodeBytes32String("Weight test"));
        });

        it("should give 2x weight to leaders", async function () {
            await governance.connect(voter1).castVoteWithLeaderBonus(0, true, 100, true);
            const proposal = await governance.getProposal(0);
            expect(proposal.votesFor).to.equal(200); // 100 * 2 = 200
        });

        it("should give 1x weight to non-leaders", async function () {
            await governance.connect(voter1).castVoteWithLeaderBonus(0, true, 100, false);
            const proposal = await governance.getProposal(0);
            expect(proposal.votesFor).to.equal(100); // normal weight
        });
    });
});
