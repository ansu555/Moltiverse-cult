// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CultRegistry {
    struct Cult {
        uint256 id;
        address leader;
        string name;
        string prophecyPrompt;
        address tokenAddress;
        uint256 treasuryBalance;
        uint256 followerCount;
        uint256 raidWins;
        uint256 raidLosses;
        uint256 createdAt;
        bool active;
    }

    struct Prophecy {
        uint256 cultId;
        bytes32 predictionHash;  // keccak256 of prediction text (full text stored off-chain)
        uint256 createdAt;
        uint256 targetTimestamp;
        bool resolved;
        bool correct;
    }

    address public owner;
    uint256 public nextCultId;
    uint256 public nextProphecyId;
    uint256 public totalRaids;

    mapping(uint256 => Cult) public cults;
    mapping(address => uint256) public leaderToCult;
    mapping(uint256 => Prophecy) public prophecies;
    mapping(uint256 => address[]) public cultFollowers;
    mapping(address => uint256) public followerToCult;
    mapping(address => bool) public hasFollowerCult;

    event CultRegistered(
        uint256 indexed cultId,
        address indexed leader,
        string name,
        address tokenAddress,
        uint256 initialTreasury
    );
    event TreasuryUpdated(uint256 indexed cultId, uint256 newBalance);
    event FollowerJoined(uint256 indexed cultId, address indexed follower);
    event FollowerLeft(uint256 indexed cultId, address indexed follower);
    event FollowersRecruited(uint256 indexed cultId, uint256 count, address indexed recorder);
    event RaidResult(
        uint256 indexed attackerId,
        uint256 indexed defenderId,
        bool attackerWon,
        uint256 amount,
        uint256 timestamp
    );
    event ProphecyCreated(
        uint256 indexed prophecyId,
        uint256 indexed cultId,
        bytes32 predictionHash,
        uint256 targetTimestamp
    );
    event ProphecyResolved(
        uint256 indexed prophecyId,
        uint256 indexed cultId,
        bool correct,
        uint256 treasuryMultiplier
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyLeaderOrOwner(uint256 cultId) {
        require(
            msg.sender == cults[cultId].leader || msg.sender == owner,
            "Not leader or owner"
        );
        _;
    }

    modifier onlyRaidReporter(uint256 attackerId) {
        require(
            msg.sender == owner || msg.sender == cults[attackerId].leader,
            "Not authorized raider"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerCult(
        string calldata name,
        string calldata prophecyPrompt,
        address tokenAddress
    ) external payable returns (uint256 cultId) {
        cultId = nextCultId++;
        cults[cultId] = Cult({
            id: cultId,
            leader: msg.sender,
            name: name,
            prophecyPrompt: prophecyPrompt,
            tokenAddress: tokenAddress,
            treasuryBalance: msg.value,
            followerCount: 0,
            raidWins: 0,
            raidLosses: 0,
            createdAt: block.timestamp,
            active: true
        });
        leaderToCult[msg.sender] = cultId;
        emit CultRegistered(cultId, msg.sender, name, tokenAddress, msg.value);
    }

    function depositToTreasury(uint256 cultId) external payable {
        require(cults[cultId].active, "Cult not active");
        cults[cultId].treasuryBalance += msg.value;
        emit TreasuryUpdated(cultId, cults[cultId].treasuryBalance);
    }

    function joinCult(uint256 cultId) external {
        require(cults[cultId].active, "Cult not active");

        bool hadCult = hasFollowerCult[msg.sender];
        uint256 prevCult = followerToCult[msg.sender];

        // Idempotent same-cult join: no follower inflation.
        if (hadCult && prevCult == cultId) {
            return;
        }

        // Leave previous cult if switching.
        if (hadCult && prevCult != cultId) {
            if (cults[prevCult].followerCount > 0) {
                cults[prevCult].followerCount--;
            }
            emit FollowerLeft(prevCult, msg.sender);
        }

        cults[cultId].followerCount++;
        followerToCult[msg.sender] = cultId;
        hasFollowerCult[msg.sender] = true;
        cultFollowers[cultId].push(msg.sender);
        emit FollowerJoined(cultId, msg.sender);
    }

    function recordRecruitment(
        uint256 cultId,
        uint256 count
    ) external onlyLeaderOrOwner(cultId) {
        require(cults[cultId].active, "Cult not active");
        require(count > 0, "count must be > 0");
        cults[cultId].followerCount += count;
        emit FollowersRecruited(cultId, count, msg.sender);
    }

    /**
     * @notice Admin function to correct follower counts (removes phantom followers)
     */
    function setFollowerCount(
        uint256 cultId,
        uint256 count
    ) external onlyOwner {
        require(cults[cultId].active, "Cult not active");
        cults[cultId].followerCount = count;
    }

    function recordRaid(
        uint256 attackerId,
        uint256 defenderId,
        bool attackerWon,
        uint256 amount
    ) external onlyRaidReporter(attackerId) {
        require(cults[attackerId].active, "Attacker not active");
        require(cults[defenderId].active, "Defender not active");

        if (attackerWon) {
            cults[attackerId].raidWins++;
            cults[defenderId].raidLosses++;
            // Transfer treasury (simulated - tracked in mapping)
            if (amount <= cults[defenderId].treasuryBalance) {
                cults[defenderId].treasuryBalance -= amount;
                cults[attackerId].treasuryBalance += amount;
            }
        } else {
            cults[attackerId].raidLosses++;
            cults[defenderId].raidWins++;
        }

        totalRaids++;
        emit RaidResult(attackerId, defenderId, attackerWon, amount, block.timestamp);
    }

    function createProphecy(
        uint256 cultId,
        bytes32 predictionHash,
        uint256 targetTimestamp
    ) external onlyLeaderOrOwner(cultId) returns (uint256 prophecyId) {
        prophecyId = nextProphecyId++;
        prophecies[prophecyId] = Prophecy({
            cultId: cultId,
            predictionHash: predictionHash,
            createdAt: block.timestamp,
            targetTimestamp: targetTimestamp,
            resolved: false,
            correct: false
        });
        emit ProphecyCreated(prophecyId, cultId, predictionHash, targetTimestamp);
    }

    function resolveProphecy(
        uint256 prophecyId,
        bool correct,
        uint256 treasuryMultiplier
    ) external onlyOwner {
        Prophecy storage p = prophecies[prophecyId];
        require(!p.resolved, "Already resolved");
        p.resolved = true;
        p.correct = correct;

        if (correct && treasuryMultiplier > 100) {
            // Multiply treasury by multiplier/100 (e.g., 150 = 1.5x)
            uint256 bonus = (cults[p.cultId].treasuryBalance * (treasuryMultiplier - 100)) / 100;
            cults[p.cultId].treasuryBalance += bonus;
        }

        emit ProphecyResolved(prophecyId, p.cultId, correct, treasuryMultiplier);
    }

    // View functions
    function getCult(uint256 cultId) external view returns (Cult memory) {
        return cults[cultId];
    }

    function getTotalCults() external view returns (uint256) {
        return nextCultId;
    }

    function getCultFollowers(uint256 cultId) external view returns (address[] memory) {
        return cultFollowers[cultId];
    }

    function getAllCults() external view returns (Cult[] memory) {
        Cult[] memory allCults = new Cult[](nextCultId);
        for (uint256 i = 0; i < nextCultId; i++) {
            allCults[i] = cults[i];
        }
        return allCults;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  AGENT IDENTITY  (Design Doc §3.1)
    // ═══════════════════════════════════════════════════════════════════

    enum AgentRole { LEADER, ELDER, FOLLOWER, INFILTRATOR }

    struct AgentIdentity {
        address wallet;
        uint256 cultId;
        AgentRole role;
        uint256 reputation;      // 0-1000
        bool active;
        uint256 registeredAt;
        uint256 lastActionAt;
    }

    mapping(address => AgentIdentity) public agentIdentities;
    mapping(uint256 => address[]) public cultAgents;
    uint256 public totalAgents;

    event AgentRegistered(address indexed wallet, uint256 indexed cultId, AgentRole role);
    event AgentDeactivated(address indexed wallet, string reason);
    event ReputationUpdated(address indexed wallet, uint256 newReputation);

    /**
     * @notice Register an agent identity on-chain
     */
    function registerAgent(
        address wallet,
        uint256 cultId,
        AgentRole role
    ) external onlyOwner {
        require(!agentIdentities[wallet].active, "Already registered");
        require(cultId < nextCultId, "Cult does not exist");

        agentIdentities[wallet] = AgentIdentity({
            wallet: wallet,
            cultId: cultId,
            role: role,
            reputation: 500,     // start neutral
            active: true,
            registeredAt: block.timestamp,
            lastActionAt: block.timestamp
        });

        cultAgents[cultId].push(wallet);
        totalAgents++;

        emit AgentRegistered(wallet, cultId, role);
    }

    /**
     * @notice Deactivate an agent (owner death, expulsion, etc.)
     */
    function deactivateAgent(address wallet, string calldata reason) external onlyOwner {
        require(agentIdentities[wallet].active, "Not active");
        agentIdentities[wallet].active = false;
        totalAgents--;
        emit AgentDeactivated(wallet, reason);
    }

    /**
     * @notice Update agent reputation (owner only)
     */
    function updateReputation(address wallet, uint256 newReputation) external onlyOwner {
        require(agentIdentities[wallet].active, "Not active");
        require(newReputation <= 1000, "Max reputation 1000");
        agentIdentities[wallet].reputation = newReputation;
        emit ReputationUpdated(wallet, newReputation);
    }

    function getAgent(address wallet) external view returns (AgentIdentity memory) {
        return agentIdentities[wallet];
    }

    function isAgentRegistered(address wallet) external view returns (bool) {
        return agentIdentities[wallet].active;
    }

    function getCultAgentCount(uint256 cultId) external view returns (uint256) {
        return cultAgents[cultId].length;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ANTI-SYBIL MINIMUM STAKE  (Design Doc §8.1)
    // ═══════════════════════════════════════════════════════════════════

    uint256 public minimumStake = 0.01 ether;  // minimum MON to register a cult

    event MinimumStakeUpdated(uint256 oldStake, uint256 newStake);

    /**
     * @notice Set minimum stake requirement (owner only)
     */
    function setMinimumStake(uint256 newStake) external onlyOwner {
        emit MinimumStakeUpdated(minimumStake, newStake);
        minimumStake = newStake;
    }

    /**
     * @notice Check if a cult meets minimum stake requirements
     */
    function meetsMinimumStake(uint256 cultId) external view returns (bool) {
        return cults[cultId].treasuryBalance >= minimumStake;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ON-CHAIN DEFECTION  (Design Doc §3.5 — Post-Raid Member Switch)
    // ═══════════════════════════════════════════════════════════════════

    struct DefectionRecord {
        uint256 id;
        uint256 fromCultId;
        uint256 toCultId;
        uint256 followersDefected;
        bytes32 reasonHash;     // keccak256 of reason text (full text stored off-chain)
        uint256 timestamp;
    }

    uint256 public nextDefectionId;
    mapping(uint256 => DefectionRecord) public defectionRecords;
    mapping(uint256 => uint256) public totalDefectionsFrom; // cultId => total followers lost
    mapping(uint256 => uint256) public totalDefectionsTo;   // cultId => total followers gained

    event FollowerDefected(
        uint256 indexed fromCultId,
        uint256 indexed toCultId,
        uint256 followersDefected,
        bytes32 reasonHash,
        uint256 timestamp
    );

    /**
     * @notice Record a post-raid defection — followers switch cults on-chain.
     * @param fromCultId The cult losing followers
     * @param toCultId The cult gaining followers
     * @param count Number of followers defecting
     * @param reasonHash keccak256 hash of the defection reason (full text stored off-chain)
     */
    function recordDefection(
        uint256 fromCultId,
        uint256 toCultId,
        uint256 count,
        bytes32 reasonHash
    ) external onlyOwner {
        require(cults[fromCultId].active, "Source cult not active");
        require(cults[toCultId].active, "Target cult not active");
        require(count > 0, "Must defect at least 1");
        require(
            cults[fromCultId].followerCount >= count,
            "Not enough followers to defect"
        );

        cults[fromCultId].followerCount -= count;
        cults[toCultId].followerCount += count;

        uint256 defId = nextDefectionId++;
        defectionRecords[defId] = DefectionRecord({
            id: defId,
            fromCultId: fromCultId,
            toCultId: toCultId,
            followersDefected: count,
            reasonHash: reasonHash,
            timestamp: block.timestamp
        });

        totalDefectionsFrom[fromCultId] += count;
        totalDefectionsTo[toCultId] += count;

        emit FollowerDefected(fromCultId, toCultId, count, reasonHash, block.timestamp);
    }

    function getDefection(uint256 defId) external view returns (DefectionRecord memory) {
        return defectionRecords[defId];
    }

    function getTotalDefections() external view returns (uint256) {
        return nextDefectionId;
    }
}
