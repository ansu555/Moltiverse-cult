// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RaidEngine
 * @notice On-chain raid resolution with power formula, spoils distribution, and cooldowns.
 * @dev Design Doc §3.5: "Raids are the primary wealth redistribution mechanism."
 *
 *      Power = Treasury × 0.6 + Members × 100 × 0.4
 *      Spoils: 70% to winner, 20% protocol fee, 10% burned
 *      Cooldown: 2 minutes between same-pair raids
 */
contract RaidEngine {

    struct Raid {
        uint256 id;
        uint256 attackerId;
        uint256 defenderId;
        uint256 wagerAmount;
        bool attackerWon;
        uint256 spoilsToWinner;
        uint256 warDividend;       // NEW: bonus value minted for winner (non-zero-sum)
        uint256 protocolFee;
        uint256 burned;
        uint256 timestamp;
    }

    // ── State ──────────────────────────────────────────────────────────
    address public owner;
    address public cultRegistry;

    uint256 public nextRaidId;
    uint256 public cooldownDuration = 120;   // 2 minutes in seconds
    uint256 public spoilsWinnerBps = 8000;   // 80% (up from 70% — less extractive)
    uint256 public spoilsProtocolBps = 1000;  // 10% (down from 20%)
    uint256 public spoilsBurnBps = 1000;      // 10% (same)
    uint256 public warDividendBps = 1500;     // 15% bonus MINTED for winner (non-zero-sum)

    // Raid storage
    mapping(uint256 => Raid) public raids;

    // Cooldown: keccak256(attackerId, defenderId) => last raid timestamp
    mapping(bytes32 => uint256) public lastRaidTime;

    // Per-cult raid stats
    mapping(uint256 => uint256) public raidWins;
    mapping(uint256 => uint256) public raidLosses;
    mapping(uint256 => uint256) public totalSpoilsWon;
    mapping(uint256 => uint256) public totalSpoilsLost;

    // Protocol totals
    uint256 public totalRaids;
    uint256 public totalProtocolFees;
    uint256 public totalBurned;
    uint256 public totalWarDividendsMinted;   // new value created through raids

    // ── Events ─────────────────────────────────────────────────────────
    event RaidInitiated(
        uint256 indexed raidId,
        uint256 indexed attackerId,
        uint256 indexed defenderId,
        uint256 wagerAmount
    );

    event RaidResolved(
        uint256 indexed raidId,
        bool attackerWon,
        uint256 spoilsToWinner,
        uint256 warDividend,
        uint256 protocolFee,
        uint256 burned
    );

    event CooldownUpdated(uint256 oldDuration, uint256 newDuration);
    event WarDividendMinted(uint256 indexed raidId, uint256 indexed winnerCultId, uint256 amount);

    // ── Modifiers ──────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────
    constructor(address _cultRegistry) {
        owner = msg.sender;
        cultRegistry = _cultRegistry;
    }

    // ── Core Raid Functions ────────────────────────────────────────────

    /**
     * @notice Initiate and immediately resolve a raid between two cults.
     * @param attackerId Attacking cult ID
     * @param defenderId Defending cult ID
     * @param wagerAmount Amount wagered
     * @param attackerTreasury Attacker's treasury balance
     * @param attackerMembers Attacker's follower count
     * @param defenderTreasury Defender's treasury balance
     * @param defenderMembers Defender's follower count
     * @param randomSeed Seed for pseudo-randomness
     * @return raidId The ID of the resolved raid
     * @return attackerWon Whether the attacker won
     */
    function initiateRaid(
        uint256 attackerId,
        uint256 defenderId,
        uint256 wagerAmount,
        uint256 attackerTreasury,
        uint256 attackerMembers,
        uint256 defenderTreasury,
        uint256 defenderMembers,
        uint256 randomSeed
    ) external onlyOwner returns (uint256 raidId, bool attackerWon) {
        require(attackerId != defenderId, "Cannot raid yourself");
        require(wagerAmount > 0, "Wager must be > 0");
        require(wagerAmount <= attackerTreasury, "Wager exceeds treasury");

        // Check cooldown
        _checkCooldown(attackerId, defenderId);

        // Resolve combat
        attackerWon = _resolveCombat(
            attackerTreasury, attackerMembers,
            defenderTreasury, defenderMembers,
            randomSeed
        );

        // Create record & distribute spoils
        raidId = _recordRaid(attackerId, defenderId, wagerAmount, attackerWon);
    }

    // ── Internal Helpers ───────────────────────────────────────────────

    function _checkCooldown(uint256 attackerId, uint256 defenderId) internal {
        bytes32 key = keccak256(abi.encodePacked(attackerId, defenderId));
        require(
            block.timestamp >= lastRaidTime[key] + cooldownDuration,
            "Raid on cooldown"
        );
        lastRaidTime[key] = block.timestamp;
    }

    function _resolveCombat(
        uint256 atkTreasury,
        uint256 atkMembers,
        uint256 defTreasury,
        uint256 defMembers,
        uint256 seed
    ) internal pure returns (bool) {
        uint256 atkPower = _calculatePower(atkTreasury, atkMembers);
        uint256 defPower = _calculatePower(defTreasury, defMembers);

        // ±20% variance; defender gets +5% home advantage
        uint256 atkScore = atkPower * (80 + (seed % 41));
        uint256 defScore = defPower * (85 + ((seed / 100) % 41));

        return atkScore > defScore;
    }

    function _recordRaid(
        uint256 attackerId,
        uint256 defenderId,
        uint256 wagerAmount,
        bool attackerWon
    ) internal returns (uint256 raidId) {
        // Spoils calculation (from wager)
        uint256 spoils = (wagerAmount * spoilsWinnerBps) / 10000;
        uint256 fee = (wagerAmount * spoilsProtocolBps) / 10000;
        uint256 burn = wagerAmount - spoils - fee;

        // War dividend: NEW value minted on top of wager (non-zero-sum)
        uint256 dividend = (wagerAmount * warDividendBps) / 10000;

        raidId = nextRaidId++;
        raids[raidId] = Raid({
            id: raidId,
            attackerId: attackerId,
            defenderId: defenderId,
            wagerAmount: wagerAmount,
            attackerWon: attackerWon,
            spoilsToWinner: spoils,
            warDividend: dividend,
            protocolFee: fee,
            burned: burn,
            timestamp: block.timestamp
        });

        // Update stats
        uint256 winnerId = attackerWon ? attackerId : defenderId;
        _updateStats(attackerId, defenderId, attackerWon, spoils + dividend, wagerAmount);

        totalRaids++;
        totalProtocolFees += fee;
        totalBurned += burn;
        totalWarDividendsMinted += dividend;

        emit RaidInitiated(raidId, attackerId, defenderId, wagerAmount);
        emit RaidResolved(raidId, attackerWon, spoils, dividend, fee, burn);
        emit WarDividendMinted(raidId, winnerId, dividend);
    }

    function _updateStats(
        uint256 attackerId,
        uint256 defenderId,
        bool attackerWon,
        uint256 spoils,
        uint256 wager
    ) internal {
        if (attackerWon) {
            raidWins[attackerId]++;
            raidLosses[defenderId]++;
            totalSpoilsWon[attackerId] += spoils;
            totalSpoilsLost[defenderId] += wager;
        } else {
            raidLosses[attackerId]++;
            raidWins[defenderId]++;
            totalSpoilsWon[defenderId] += spoils;
            totalSpoilsLost[attackerId] += wager;
        }
    }

    // ── Power Calculation ──────────────────────────────────────────────

    /**
     * @dev Power = Treasury × 0.6 + Members × 100 × 0.4
     */
    function _calculatePower(
        uint256 treasury,
        uint256 members
    ) internal pure returns (uint256) {
        return (treasury * 6) / 10 + (members * 100 * 4) / 10;
    }

    /**
     * @notice Public power calculation for frontend display
     */
    function calculatePower(
        uint256 treasury,
        uint256 members
    ) external pure returns (uint256) {
        return _calculatePower(treasury, members);
    }

    // ── Cooldown Views ─────────────────────────────────────────────────

    function isOnCooldown(
        uint256 attackerId,
        uint256 defenderId
    ) external view returns (bool) {
        bytes32 key = keccak256(abi.encodePacked(attackerId, defenderId));
        return block.timestamp < lastRaidTime[key] + cooldownDuration;
    }

    function getCooldownRemaining(
        uint256 attackerId,
        uint256 defenderId
    ) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(attackerId, defenderId));
        uint256 nextAllowed = lastRaidTime[key] + cooldownDuration;
        if (block.timestamp >= nextAllowed) return 0;
        return nextAllowed - block.timestamp;
    }

    // ── View Functions ─────────────────────────────────────────────────

    function getRaid(uint256 raidId) external view returns (Raid memory) {
        return raids[raidId];
    }

    function getCultStats(uint256 cultId) external view returns (
        uint256 wins,
        uint256 losses,
        uint256 spoilsWon,
        uint256 spoilsLost
    ) {
        return (
            raidWins[cultId],
            raidLosses[cultId],
            totalSpoilsWon[cultId],
            totalSpoilsLost[cultId]
        );
    }

    function getProtocolStats() external view returns (
        uint256 raids_,
        uint256 fees,
        uint256 burned_
    ) {
        return (totalRaids, totalProtocolFees, totalBurned);
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setCooldownDuration(uint256 newDuration) external onlyOwner {
        emit CooldownUpdated(cooldownDuration, newDuration);
        cooldownDuration = newDuration;
    }

    function setSpoilsDistribution(
        uint256 winnerBps,
        uint256 protocolBps,
        uint256 burnBps
    ) external onlyOwner {
        require(winnerBps + protocolBps + burnBps == 10000, "Must sum to 100%");
        spoilsWinnerBps = winnerBps;
        spoilsProtocolBps = protocolBps;
        spoilsBurnBps = burnBps;
    }

    function setWarDividendBps(uint256 newBps) external onlyOwner {
        require(newBps <= 3000, "Max 30% war dividend");
        warDividendBps = newBps;
    }

    function getNonZeroSumStats() external view returns (
        uint256 dividendsMinted,
        uint256 totalFees,
        uint256 burned
    ) {
        return (totalWarDividendsMinted, totalProtocolFees, totalBurned);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SPOILS DISTRIBUTION VOTE  (Design Doc §7.5)
    // ═══════════════════════════════════════════════════════════════════

    enum SpoilsVoteStatus { ACTIVE, RESOLVED }

    struct SpoilsVote {
        uint256 id;
        uint256 raidId;
        uint256 winnerCultId;
        uint256 totalSpoils;
        uint256 treasuryVotes;      // votes for treasury allocation
        uint256 stakersVotes;       // votes for staker distribution
        uint256 reinvestVotes;      // votes for reinvestment
        uint256 totalVoters;
        SpoilsVoteStatus status;
        uint256 createdAt;
        uint256 endsAt;
    }

    uint256 public nextSpoilsVoteId;
    uint256 public spoilsVoteDuration = 120; // 2 minutes
    mapping(uint256 => SpoilsVote) public spoilsVotes;
    mapping(uint256 => mapping(address => bool)) public spoilsVoters; // voteId => voter => voted

    event SpoilsVoteCreated(uint256 indexed voteId, uint256 indexed raidId, uint256 totalSpoils);
    event SpoilsVoteCast(uint256 indexed voteId, address indexed voter, uint8 choice);
    event SpoilsVoteResolved(uint256 indexed voteId, string winningAllocation);

    /**
     * @notice Create a spoils distribution vote after a winning raid.
     * @param raidId The raid whose spoils are being voted on
     * @param winnerCultId The cult that won the raid
     * @param totalSpoils Total spoils amount
     */
    function createSpoilsVote(
        uint256 raidId,
        uint256 winnerCultId,
        uint256 totalSpoils
    ) external onlyOwner returns (uint256 voteId) {
        voteId = nextSpoilsVoteId++;
        spoilsVotes[voteId] = SpoilsVote({
            id: voteId,
            raidId: raidId,
            winnerCultId: winnerCultId,
            totalSpoils: totalSpoils,
            treasuryVotes: 0,
            stakersVotes: 0,
            reinvestVotes: 0,
            totalVoters: 0,
            status: SpoilsVoteStatus.ACTIVE,
            createdAt: block.timestamp,
            endsAt: block.timestamp + spoilsVoteDuration
        });
        emit SpoilsVoteCreated(voteId, raidId, totalSpoils);
    }

    /**
     * @notice Vote on how to distribute raid spoils.
     * @param voteId The spoils vote ID
     * @param choice 0 = treasury, 1 = stakers, 2 = reinvest
     */
    function castSpoilsVote(uint256 voteId, uint8 choice) external {
        SpoilsVote storage v = spoilsVotes[voteId];
        require(v.status == SpoilsVoteStatus.ACTIVE, "Vote not active");
        require(block.timestamp <= v.endsAt, "Voting ended");
        require(!spoilsVoters[voteId][msg.sender], "Already voted");
        require(choice <= 2, "Invalid choice");

        spoilsVoters[voteId][msg.sender] = true;
        v.totalVoters++;

        if (choice == 0) v.treasuryVotes++;
        else if (choice == 1) v.stakersVotes++;
        else v.reinvestVotes++;

        emit SpoilsVoteCast(voteId, msg.sender, choice);
    }

    /**
     * @notice Resolve a spoils vote after the voting period.
     * @param voteId The spoils vote to resolve
     * @return winningChoice 0=treasury, 1=stakers, 2=reinvest
     */
    function resolveSpoilsVote(uint256 voteId) external onlyOwner returns (uint8 winningChoice) {
        SpoilsVote storage v = spoilsVotes[voteId];
        require(v.status == SpoilsVoteStatus.ACTIVE, "Not active");
        require(block.timestamp > v.endsAt, "Voting not ended");

        v.status = SpoilsVoteStatus.RESOLVED;

        // Determine winner
        if (v.stakersVotes > v.treasuryVotes && v.stakersVotes > v.reinvestVotes) {
            winningChoice = 1;
            emit SpoilsVoteResolved(voteId, "stakers");
        } else if (v.reinvestVotes > v.treasuryVotes && v.reinvestVotes > v.stakersVotes) {
            winningChoice = 2;
            emit SpoilsVoteResolved(voteId, "reinvest");
        } else {
            winningChoice = 0; // treasury is default
            emit SpoilsVoteResolved(voteId, "treasury");
        }
    }

    function getSpoilsVote(uint256 voteId) external view returns (SpoilsVote memory) {
        return spoilsVotes[voteId];
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ALLIANCE JOINT RAIDS  (Design Doc §3.5.2)
    // ═══════════════════════════════════════════════════════════════════

    struct JointRaid {
        uint256 id;
        uint256 attacker1Id;
        uint256 attacker2Id;      // ally
        uint256 defenderId;
        uint256 combinedWager;
        bool attackersWon;
        uint256 spoilsToAttacker1;
        uint256 spoilsToAttacker2;
        uint256 warDividend;       // NEW: bonus minted for winners
        uint256 protocolFee;
        uint256 burned;
        uint256 timestamp;
    }

    struct JointRaidParams {
        uint256 attacker1Id;
        uint256 attacker2Id;
        uint256 defenderId;
        uint256 wager1;
        uint256 wager2;
        uint256 atk1Treasury;
        uint256 atk1Members;
        uint256 atk2Treasury;
        uint256 atk2Members;
        uint256 defTreasury;
        uint256 defMembers;
        uint256 randomSeed;
    }

    uint256 public nextJointRaidId;
    mapping(uint256 => JointRaid) public jointRaids;

    event JointRaidInitiated(
        uint256 indexed jointRaidId,
        uint256 indexed attacker1Id,
        uint256 indexed attacker2Id,
        uint256 defenderId
    );
    event JointRaidResolved(
        uint256 indexed jointRaidId,
        bool attackersWon,
        uint256 spoilsToAttacker1,
        uint256 spoilsToAttacker2
    );

    /**
     * @notice Execute a joint raid with an ally — combined power against a defender.
     * @param p JointRaidParams struct containing all raid parameters
     */
    function initiateJointRaid(
        JointRaidParams calldata p
    ) external onlyOwner returns (uint256 jointRaidId, bool attackersWon) {
        require(p.attacker1Id != p.attacker2Id, "Cannot joint raid with self");
        require(p.attacker1Id != p.defenderId && p.attacker2Id != p.defenderId, "Cannot raid yourself");
        require(p.wager1 + p.wager2 > 0, "Wager must be > 0");

        // Combined attacker power
        uint256 combinedAtkPower = _calculatePower(p.atk1Treasury, p.atk1Members) +
                                    _calculatePower(p.atk2Treasury, p.atk2Members);

        // ±20% variance; defender gets +5% home advantage
        attackersWon = (combinedAtkPower * (80 + (p.randomSeed % 41))) >
                       (_calculatePower(p.defTreasury, p.defMembers) * (85 + ((p.randomSeed / 100) % 41)));

        jointRaidId = nextJointRaidId++;

        _resolveJointRaid(jointRaidId, p.attacker1Id, p.attacker2Id, p.defenderId, p.wager1, p.wager2, attackersWon);
    }

    function _resolveJointRaid(
        uint256 jointRaidId,
        uint256 attacker1Id,
        uint256 attacker2Id,
        uint256 defenderId,
        uint256 wager1,
        uint256 wager2,
        bool attackersWon
    ) internal {
        uint256 totalWager = wager1 + wager2;
        uint256 spoils = (totalWager * spoilsWinnerBps) / 10000;
        uint256 fee = (totalWager * spoilsProtocolBps) / 10000;
        uint256 dividend = (totalWager * warDividendBps) / 10000;

        // Split spoils + dividend proportionally between allies
        uint256 spoils1 = totalWager > 0 ? (spoils * wager1) / totalWager : 0;
        uint256 dividend1 = totalWager > 0 ? (dividend * wager1) / totalWager : 0;

        jointRaids[jointRaidId] = JointRaid({
            id: jointRaidId,
            attacker1Id: attacker1Id,
            attacker2Id: attacker2Id,
            defenderId: defenderId,
            combinedWager: totalWager,
            attackersWon: attackersWon,
            spoilsToAttacker1: spoils1 + dividend1,
            spoilsToAttacker2: (spoils - spoils1) + (dividend - dividend1),
            warDividend: dividend,
            protocolFee: fee,
            burned: totalWager - spoils - fee,
            timestamp: block.timestamp
        });

        totalRaids++;
        totalProtocolFees += fee;
        totalBurned += totalWager - spoils - fee;
        totalWarDividendsMinted += dividend;

        // Update stats for all parties
        if (attackersWon) {
            raidWins[attacker1Id]++;
            raidWins[attacker2Id]++;
            raidLosses[defenderId]++;
            totalSpoilsWon[attacker1Id] += spoils1 + dividend1;
            totalSpoilsWon[attacker2Id] += (spoils - spoils1) + (dividend - dividend1);
            totalSpoilsLost[defenderId] += totalWager;
        } else {
            raidLosses[attacker1Id]++;
            raidLosses[attacker2Id]++;
            raidWins[defenderId]++;
            totalSpoilsLost[attacker1Id] += wager1;
            totalSpoilsLost[attacker2Id] += wager2;
            totalSpoilsWon[defenderId] += spoils + dividend;
        }

        emit JointRaidInitiated(jointRaidId, attacker1Id, attacker2Id, defenderId);
        emit JointRaidResolved(jointRaidId, attackersWon, spoils1 + dividend1, (spoils - spoils1) + (dividend - dividend1));
    }

    function getJointRaid(uint256 jointRaidId) external view returns (JointRaid memory) {
        return jointRaids[jointRaidId];
    }
}
