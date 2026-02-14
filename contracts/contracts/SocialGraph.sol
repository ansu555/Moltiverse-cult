// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SocialGraph
 * @notice On-chain social graph tracking alliances, trust, and betrayals between cults.
 * @dev Per design doc §4.3 — formal alliance pacts, trust scores, betrayal mechanics.
 */
contract SocialGraph {

    struct Alliance {
        uint256 id;
        uint256 cult1Id;
        uint256 cult2Id;
        AllianceType allianceType;
        uint256 formedAt;
        uint256 expiresAt;
        AllianceStatus status;
    }

    enum AllianceType { MUTUAL_DEFENSE, JOINT_OFFENSE }
    enum AllianceStatus { ACTIVE, EXPIRED, BROKEN }

    // ── State ──────────────────────────────────────────────────────────
    address public owner;
    uint256 public nextAllianceId;

    // Trust scores: cult -> rival -> score (0-100)
    mapping(uint256 => mapping(uint256 => uint256)) public trustScores;

    // Alliance storage
    mapping(uint256 => Alliance) public alliances;

    // Active alliance lookup: smaller cultId -> larger cultId -> allianceId
    mapping(uint256 => mapping(uint256 => uint256)) public activePact;

    // Per-cult alliance count
    mapping(uint256 => uint256) public allianceCount;

    // Betrayal records
    uint256 public totalBetrayals;
    mapping(uint256 => uint256) public betrayalCount; // cult -> times betrayed

    // ── Events ─────────────────────────────────────────────────────────
    event AllianceFormed(
        uint256 indexed allianceId,
        uint256 indexed cult1,
        uint256 indexed cult2,
        AllianceType allianceType,
        uint256 expiresAt
    );
    event AllianceBroken(
        uint256 indexed allianceId,
        uint256 indexed breakerId,
        uint256 indexed victimId
    );
    event AllianceExpired(uint256 indexed allianceId);
    event TrustUpdated(
        uint256 indexed cultId,
        uint256 indexed rivalId,
        uint256 oldScore,
        uint256 newScore,
        string reason
    );
    event BetrayalRecorded(
        uint256 indexed betrayerId,
        uint256 indexed victimId,
        uint256 allianceId,
        uint256 timestamp
    );

    // ── Modifiers ──────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Alliance Management ────────────────────────────────────────────

    /**
     * @notice Form an alliance between two cults
     * @param cult1Id First cult ID
     * @param cult2Id Second cult ID
     * @param allianceType Type of alliance (defense or offense)
     * @param durationSeconds How long the alliance lasts
     */
    function formAlliance(
        uint256 cult1Id,
        uint256 cult2Id,
        AllianceType allianceType,
        uint256 durationSeconds
    ) external onlyOwner returns (uint256 allianceId) {
        require(cult1Id != cult2Id, "Cannot ally with self");
        require(durationSeconds > 0 && durationSeconds <= 3600, "Duration 1s-1h");

        // Normalize: smaller ID first
        (uint256 a, uint256 b) = cult1Id < cult2Id
            ? (cult1Id, cult2Id)
            : (cult2Id, cult1Id);

        // Check no active pact exists
        uint256 existing = activePact[a][b];
        if (existing != 0) {
            require(
                alliances[existing].status != AllianceStatus.ACTIVE,
                "Already allied"
            );
        }

        allianceId = ++nextAllianceId; // start from 1 to distinguish from 0
        uint256 expires = block.timestamp + durationSeconds;

        alliances[allianceId] = Alliance({
            id: allianceId,
            cult1Id: a,
            cult2Id: b,
            allianceType: allianceType,
            formedAt: block.timestamp,
            expiresAt: expires,
            status: AllianceStatus.ACTIVE
        });

        activePact[a][b] = allianceId;
        allianceCount[a]++;
        allianceCount[b]++;

        // Alliance formation increases trust
        _updateTrust(a, b, 20, "alliance_formed");
        _updateTrust(b, a, 20, "alliance_formed");

        emit AllianceFormed(allianceId, a, b, allianceType, expires);
    }

    /**
     * @notice Expire an alliance (called after duration elapses)
     * @param allianceId The alliance to expire
     */
    function expireAlliance(uint256 allianceId) external onlyOwner {
        Alliance storage a = alliances[allianceId];
        require(a.status == AllianceStatus.ACTIVE, "Not active");
        require(block.timestamp >= a.expiresAt, "Not expired yet");

        a.status = AllianceStatus.EXPIRED;
        emit AllianceExpired(allianceId);
    }

    /**
     * @notice Record a betrayal — breaks the alliance and tanks trust
     * @param allianceId Alliance being betrayed
     * @param betrayerId The cult that betrayed
     */
    function recordBetrayal(
        uint256 allianceId,
        uint256 betrayerId
    ) external onlyOwner {
        Alliance storage a = alliances[allianceId];
        require(a.status == AllianceStatus.ACTIVE, "Not active alliance");
        require(
            betrayerId == a.cult1Id || betrayerId == a.cult2Id,
            "Not in this alliance"
        );

        uint256 victimId = betrayerId == a.cult1Id ? a.cult2Id : a.cult1Id;

        a.status = AllianceStatus.BROKEN;

        // Trust collapses to 0 globally for the betrayer
        _setTrust(betrayerId, victimId, 0, "betrayal");
        // Victim also loses trust in betrayer
        _setTrust(victimId, betrayerId, 0, "was_betrayed");

        betrayalCount[betrayerId]++;
        totalBetrayals++;

        emit AllianceBroken(allianceId, betrayerId, victimId);
        emit BetrayalRecorded(betrayerId, victimId, allianceId, block.timestamp);
    }

    // ── Trust Management ───────────────────────────────────────────────

    /**
     * @notice Update trust based on an event
     * @param cultId The cult whose trust is being updated
     * @param rivalId The rival cult
     * @param eventType The type of event affecting trust
     */
    function recordTrustEvent(
        uint256 cultId,
        uint256 rivalId,
        string calldata eventType
    ) external onlyOwner {
        int256 delta = _trustDelta(eventType);
        if (delta > 0) {
            _updateTrust(cultId, rivalId, uint256(delta), eventType);
        } else if (delta < 0) {
            _decreaseTrust(cultId, rivalId, uint256(-delta), eventType);
        }
    }

    /**
     * @notice Batch set trust scores (for initialization or reset)
     */
    function setTrust(
        uint256 cultId,
        uint256 rivalId,
        uint256 score
    ) external onlyOwner {
        require(score <= 100, "Score max 100");
        _setTrust(cultId, rivalId, score, "manual_set");
    }

    // ── View Functions ─────────────────────────────────────────────────

    function getAlliance(uint256 allianceId) external view returns (Alliance memory) {
        return alliances[allianceId];
    }

    function getTrust(uint256 cultId, uint256 rivalId) external view returns (uint256) {
        return trustScores[cultId][rivalId];
    }

    function areAllied(uint256 cult1Id, uint256 cult2Id) external view returns (bool) {
        (uint256 a, uint256 b) = cult1Id < cult2Id
            ? (cult1Id, cult2Id)
            : (cult2Id, cult1Id);
        uint256 aid = activePact[a][b];
        if (aid == 0) return false;
        Alliance storage al = alliances[aid];
        return al.status == AllianceStatus.ACTIVE && block.timestamp < al.expiresAt;
    }

    function getActivePact(
        uint256 cult1Id,
        uint256 cult2Id
    ) external view returns (uint256) {
        (uint256 a, uint256 b) = cult1Id < cult2Id
            ? (cult1Id, cult2Id)
            : (cult2Id, cult1Id);
        return activePact[a][b];
    }

    // ── Internal Helpers ───────────────────────────────────────────────

    function _updateTrust(
        uint256 cultId,
        uint256 rivalId,
        uint256 increase,
        string memory reason
    ) internal {
        uint256 old = trustScores[cultId][rivalId];
        uint256 newScore = old + increase;
        if (newScore > 100) newScore = 100;
        trustScores[cultId][rivalId] = newScore;
        emit TrustUpdated(cultId, rivalId, old, newScore, reason);
    }

    function _decreaseTrust(
        uint256 cultId,
        uint256 rivalId,
        uint256 decrease,
        string memory reason
    ) internal {
        uint256 old = trustScores[cultId][rivalId];
        uint256 newScore = old >= decrease ? old - decrease : 0;
        trustScores[cultId][rivalId] = newScore;
        emit TrustUpdated(cultId, rivalId, old, newScore, reason);
    }

    function _setTrust(
        uint256 cultId,
        uint256 rivalId,
        uint256 score,
        string memory reason
    ) internal {
        uint256 old = trustScores[cultId][rivalId];
        trustScores[cultId][rivalId] = score;
        emit TrustUpdated(cultId, rivalId, old, score, reason);
    }

    function _trustDelta(string calldata eventType) internal pure returns (int256) {
        bytes32 h = keccak256(bytes(eventType));
        if (h == keccak256("raid_attempt")) return -50;
        if (h == keccak256("bribe_honored")) return 10;
        if (h == keccak256("alliance_formed")) return 20;
        if (h == keccak256("joint_raid_success")) return 15;
        if (h == keccak256("peace_maintained")) return 5;
        if (h == keccak256("propaganda")) return -10;
        if (h == keccak256("betrayal")) return -100;
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  MEMBERSHIP APPROVAL & EXPULSION  (Design Doc §3.2.3)
    // ═══════════════════════════════════════════════════════════════════

    // cultId => member address => approved
    mapping(uint256 => mapping(address => bool)) public approvedMembers;
    // cultId => pending member addresses
    mapping(uint256 => address[]) public pendingMembers;
    // cultId => member count
    mapping(uint256 => uint256) public memberCount;

    event MembershipRequested(uint256 indexed cultId, address indexed member);
    event MembershipApproved(uint256 indexed cultId, address indexed member);
    event MemberExpelled(uint256 indexed cultId, address indexed member, string reason);

    /**
     * @notice Request membership in a cult (goes to pending)
     */
    function requestMembership(uint256 cultId) external {
        require(!approvedMembers[cultId][msg.sender], "Already a member");
        pendingMembers[cultId].push(msg.sender);
        emit MembershipRequested(cultId, msg.sender);
    }

    /**
     * @notice Approve a pending member (owner only)
     */
    function approveMembership(
        uint256 cultId,
        address member
    ) external onlyOwner {
        require(!approvedMembers[cultId][member], "Already approved");
        approvedMembers[cultId][member] = true;
        memberCount[cultId]++;
        emit MembershipApproved(cultId, member);
    }

    /**
     * @notice Expel a member from a cult (owner only)
     */
    function expelMember(
        uint256 cultId,
        address member,
        string calldata reason
    ) external onlyOwner {
        require(approvedMembers[cultId][member], "Not a member");
        approvedMembers[cultId][member] = false;
        if (memberCount[cultId] > 0) {
            memberCount[cultId]--;
        }
        // Expulsion damages trust with the expelled member's other affiliations
        emit MemberExpelled(cultId, member, reason);
    }

    /**
     * @notice Check if an address is an approved member
     */
    function isMember(uint256 cultId, address member) external view returns (bool) {
        return approvedMembers[cultId][member];
    }

    function getMemberCount(uint256 cultId) external view returns (uint256) {
        return memberCount[cultId];
    }

    function getPendingMemberCount(uint256 cultId) external view returns (uint256) {
        return pendingMembers[cultId].length;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SECRET ALLIANCES  (Design Doc §3.2.4)
    // ═══════════════════════════════════════════════════════════════════

    // allianceId => isPublic (default false = secret)
    mapping(uint256 => bool) public allianceIsPublic;

    event AllianceMadePublic(uint256 indexed allianceId);
    event SecretAllianceFormed(uint256 indexed allianceId, uint256 indexed cult1, uint256 indexed cult2);

    /**
     * @notice Form a secret alliance (not visible to non-participants)
     */
    function formSecretAlliance(
        uint256 cult1Id,
        uint256 cult2Id,
        AllianceType allianceType,
        uint256 durationSeconds
    ) external onlyOwner returns (uint256 allianceId) {
        require(cult1Id != cult2Id, "Cannot ally with self");
        require(durationSeconds > 0 && durationSeconds <= 3600, "Duration 1s-1h");

        (uint256 a, uint256 b) = cult1Id < cult2Id
            ? (cult1Id, cult2Id)
            : (cult2Id, cult1Id);

        uint256 existing = activePact[a][b];
        if (existing != 0) {
            require(
                alliances[existing].status != AllianceStatus.ACTIVE,
                "Already allied"
            );
        }

        allianceId = ++nextAllianceId;
        uint256 expires = block.timestamp + durationSeconds;

        alliances[allianceId] = Alliance({
            id: allianceId,
            cult1Id: a,
            cult2Id: b,
            allianceType: allianceType,
            formedAt: block.timestamp,
            expiresAt: expires,
            status: AllianceStatus.ACTIVE
        });

        activePact[a][b] = allianceId;
        allianceCount[a]++;
        allianceCount[b]++;

        // Secret alliances give less trust bonus (they're secretive)
        _updateTrust(a, b, 10, "secret_alliance");
        _updateTrust(b, a, 10, "secret_alliance");

        // Mark as NOT public (secret)
        allianceIsPublic[allianceId] = false;

        emit SecretAllianceFormed(allianceId, a, b);
    }

    /**
     * @notice Make a secret alliance public (reveal to everyone)
     */
    function makeAlliancePublic(uint256 allianceId) external onlyOwner {
        require(alliances[allianceId].status == AllianceStatus.ACTIVE, "Not active");
        allianceIsPublic[allianceId] = true;
        emit AllianceMadePublic(allianceId);
    }

    /**
     * @notice Check if an alliance is visible (public or participant)
     */
    function isAllianceVisible(
        uint256 allianceId,
        uint256 viewerCultId
    ) external view returns (bool) {
        if (allianceIsPublic[allianceId]) return true;
        Alliance storage a = alliances[allianceId];
        return viewerCultId == a.cult1Id || viewerCultId == a.cult2Id;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  NON-ZERO-SUM: COOPERATION YIELD  (Alliance Value Creation)
    // ═══════════════════════════════════════════════════════════════════
    //
    //  Sustained alliances generate new value for BOTH parties.
    //  Creates a prisoner's dilemma: cooperate for steady growth,
    //  or betray for a one-time raid advantage.
    //
    //  Yield = cooperationBps% of (cult1Treasury + cult2Treasury)
    //  Split 50/50 between allies. Requires active alliance for
    //  minimum cooperationMinDuration before first harvest.

    uint256 public cooperationBps = 50;            // 0.5% of combined treasury per harvest
    uint256 public cooperationCooldown = 300;      // 5 minutes between harvests
    uint256 public cooperationMinDuration = 120;   // alliance must be 2 min old to harvest
    mapping(uint256 => uint256) public lastCoopHarvest; // allianceId -> last harvest time
    uint256 public totalCooperationYield;          // global cooperation yield minted

    event CooperationYieldHarvested(
        uint256 indexed allianceId,
        uint256 indexed cult1Id,
        uint256 indexed cult2Id,
        uint256 yield1,
        uint256 yield2,
        uint256 timestamp
    );

    /**
     * @notice Harvest cooperation yield from a sustained alliance.
     *         Both cults receive new value — non-zero-sum.
     * @param allianceId The alliance generating yield
     * @param cult1Treasury Current treasury of cult1
     * @param cult2Treasury Current treasury of cult2
     * @return yield1 Amount credited to cult1
     * @return yield2 Amount credited to cult2
     */
    function harvestCooperationYield(
        uint256 allianceId,
        uint256 cult1Treasury,
        uint256 cult2Treasury
    ) external onlyOwner returns (uint256 yield1, uint256 yield2) {
        Alliance storage a = alliances[allianceId];
        require(a.status == AllianceStatus.ACTIVE, "Alliance not active");
        require(block.timestamp < a.expiresAt, "Alliance expired");
        require(
            block.timestamp >= a.formedAt + cooperationMinDuration,
            "Alliance too young"
        );
        require(
            block.timestamp >= lastCoopHarvest[allianceId] + cooperationCooldown,
            "Harvest on cooldown"
        );

        // Calculate yield from combined treasury (new value created)
        uint256 combinedTreasury = cult1Treasury + cult2Treasury;
        uint256 totalYield = (combinedTreasury * cooperationBps) / 10000;

        // Split 50/50 between allies
        yield1 = totalYield / 2;
        yield2 = totalYield - yield1;

        lastCoopHarvest[allianceId] = block.timestamp;
        totalCooperationYield += totalYield;

        // Boost trust for successful cooperation
        _updateTrust(a.cult1Id, a.cult2Id, 5, "cooperation_yield");
        _updateTrust(a.cult2Id, a.cult1Id, 5, "cooperation_yield");

        emit CooperationYieldHarvested(
            allianceId, a.cult1Id, a.cult2Id,
            yield1, yield2, block.timestamp
        );
    }

    // ── Cooperation Admin ──────────────────────────────────────────────

    function setCooperationBps(uint256 newBps) external onlyOwner {
        require(newBps <= 200, "Max 2%");
        cooperationBps = newBps;
    }

    function setCooperationCooldown(uint256 newCooldown) external onlyOwner {
        cooperationCooldown = newCooldown;
    }

    function getCooperationStats(uint256 allianceId) external view returns (
        uint256 lastHarvest,
        bool canHarvest,
        uint256 totalYieldGlobal
    ) {
        Alliance storage a = alliances[allianceId];
        bool ready = a.status == AllianceStatus.ACTIVE &&
                     block.timestamp < a.expiresAt &&
                     block.timestamp >= a.formedAt + cooperationMinDuration &&
                     block.timestamp >= lastCoopHarvest[allianceId] + cooperationCooldown;
        return (lastCoopHarvest[allianceId], ready, totalCooperationYield);
    }
}
