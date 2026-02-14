// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GovernanceEngine
 * @dev Democratic governance for AgentCult system.
 *      Agents create budget proposals, vote on them, and winning proposals
 *      determine cult strategy (raid vs growth vs defense vs reserve).
 *
 *      Design Doc §3.3: "Governance is the primary control mechanism.
 *      Agents vote on budgets, vote weight = stake × time factor."
 */
contract GovernanceEngine {
    // Budget allocation categories
    enum BudgetCategory { RAID, GROWTH, DEFENSE, RESERVE }

    enum ProposalStatus { ACTIVE, PASSED, REJECTED, EXECUTED }

    struct Proposal {
        uint256 id;
        uint256 cultId;
        address proposer;
        BudgetCategory category;
        uint256 raidPercent;     // % of treasury for raids
        uint256 growthPercent;   // % for recruitment/growth
        uint256 defensePercent;  // % for fortification
        uint256 reservePercent;  // % kept in reserve
        bytes32 descriptionHash; // keccak256 of description text (full text stored off-chain)
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 createdAt;
        uint256 votingEndsAt;
        ProposalStatus status;
    }

    struct Vote {
        bool hasVoted;
        bool support;
        uint256 weight;
    }

    struct BudgetAllocation {
        uint256 raidPercent;
        uint256 growthPercent;
        uint256 defensePercent;
        uint256 reservePercent;
        uint256 lastUpdated;
    }

    address public owner;
    address public cultRegistry;
    uint256 public nextProposalId;
    uint256 public votingDuration = 300; // 5 minutes for hackathon speed

    // proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;
    // proposalId => voter => Vote
    mapping(uint256 => mapping(address => Vote)) public votes;
    // cultId => current budget allocation
    mapping(uint256 => BudgetAllocation) public budgets;
    // cultId => list of proposal IDs
    mapping(uint256 => uint256[]) public cultProposals;
    // cultId => number of active proposals
    mapping(uint256 => uint256) public activeProposalCount;

    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 indexed cultId,
        address indexed proposer,
        bytes32 descriptionHash,
        uint256 votingEndsAt
    );
    event BatchVotesCast(
        uint256 indexed proposalId,
        uint256 voteCount,
        uint256 timestamp
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );
    event ProposalExecuted(
        uint256 indexed proposalId,
        uint256 indexed cultId,
        ProposalStatus status
    );
    event BudgetUpdated(
        uint256 indexed cultId,
        uint256 raidPercent,
        uint256 growthPercent,
        uint256 defensePercent,
        uint256 reservePercent
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _cultRegistry) {
        owner = msg.sender;
        cultRegistry = _cultRegistry;
    }

    /**
     * @dev Create a new budget proposal for a cult.
     *      Budget percentages must sum to 100.
     */
    function createProposal(
        uint256 cultId,
        uint256 raidPercent,
        uint256 growthPercent,
        uint256 defensePercent,
        uint256 reservePercent,
        bytes32 descriptionHash
    ) external returns (uint256 proposalId) {
        require(
            raidPercent + growthPercent + defensePercent + reservePercent == 100,
            "Budget must sum to 100%"
        );
        require(activeProposalCount[cultId] < 5, "Too many active proposals");

        proposalId = nextProposalId++;
        uint256 endsAt = block.timestamp + votingDuration;

        // Determine primary category from highest allocation
        BudgetCategory cat = BudgetCategory.RESERVE;
        uint256 maxPercent = reservePercent;
        if (raidPercent > maxPercent) { cat = BudgetCategory.RAID; maxPercent = raidPercent; }
        if (growthPercent > maxPercent) { cat = BudgetCategory.GROWTH; maxPercent = growthPercent; }
        if (defensePercent > maxPercent) { cat = BudgetCategory.DEFENSE; }

        proposals[proposalId] = Proposal({
            id: proposalId,
            cultId: cultId,
            proposer: msg.sender,
            category: cat,
            raidPercent: raidPercent,
            growthPercent: growthPercent,
            defensePercent: defensePercent,
            reservePercent: reservePercent,
            descriptionHash: descriptionHash,
            votesFor: 0,
            votesAgainst: 0,
            createdAt: block.timestamp,
            votingEndsAt: endsAt,
            status: ProposalStatus.ACTIVE
        });

        cultProposals[cultId].push(proposalId);
        activeProposalCount[cultId]++;

        emit ProposalCreated(proposalId, cultId, msg.sender, descriptionHash, endsAt);
    }

    /**
     * @dev Cast a vote on a proposal.
     *      Weight is passed by the caller (could be based on stake, membership, etc.)
     */
    function castVote(
        uint256 proposalId,
        bool support,
        uint256 weight
    ) external {
        _castVoteInternal(proposalId, msg.sender, support, weight);
    }

    /**
     * @dev Submit multiple votes in a single transaction (batch voting).
     *      The orchestrator collects agent votes off-chain and submits them
     *      together to save gas (~63% cheaper than individual txs).
     *      Only the contract owner can batch-submit on behalf of voters.
     */
    function batchCastVotes(
        uint256[] calldata proposalIds,
        address[] calldata voters,
        bool[] calldata supportFlags,
        uint256[] calldata weights
    ) external onlyOwner {
        uint256 count = proposalIds.length;
        require(
            voters.length == count &&
            supportFlags.length == count &&
            weights.length == count,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < count; i++) {
            _castVoteInternal(proposalIds[i], voters[i], supportFlags[i], weights[i]);
        }

        // Emit summary event for the batch
        if (count > 0) {
            emit BatchVotesCast(proposalIds[0], count, block.timestamp);
        }
    }

    /**
     * @dev Internal vote logic shared by castVote and batchCastVotes.
     */
    function _castVoteInternal(
        uint256 proposalId,
        address voter,
        bool support,
        uint256 weight
    ) internal {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Proposal not active");
        require(block.timestamp <= p.votingEndsAt, "Voting ended");
        require(!votes[proposalId][voter].hasVoted, "Already voted");
        require(weight > 0, "Weight must be > 0");

        votes[proposalId][voter] = Vote({
            hasVoted: true,
            support: support,
            weight: weight
        });

        if (support) {
            p.votesFor += weight;
        } else {
            p.votesAgainst += weight;
        }

        emit VoteCast(proposalId, voter, support, weight);
    }

    /**
     * @dev Execute a proposal after voting period ends.
     *      If passed, updates the cult's budget allocation.
     */
    function executeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Not active");
        require(block.timestamp > p.votingEndsAt, "Voting not ended");

        if (p.votesFor > p.votesAgainst) {
            p.status = ProposalStatus.PASSED;

            // Update budget allocation
            budgets[p.cultId] = BudgetAllocation({
                raidPercent: p.raidPercent,
                growthPercent: p.growthPercent,
                defensePercent: p.defensePercent,
                reservePercent: p.reservePercent,
                lastUpdated: block.timestamp
            });

            emit BudgetUpdated(
                p.cultId,
                p.raidPercent,
                p.growthPercent,
                p.defensePercent,
                p.reservePercent
            );
        } else {
            p.status = ProposalStatus.REJECTED;
        }

        activeProposalCount[p.cultId]--;
        emit ProposalExecuted(proposalId, p.cultId, p.status);
    }

    // ── View Functions ──────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getBudget(uint256 cultId) external view returns (BudgetAllocation memory) {
        return budgets[cultId];
    }

    function getCultProposalCount(uint256 cultId) external view returns (uint256) {
        return cultProposals[cultId].length;
    }

    function getCultProposals(uint256 cultId) external view returns (uint256[] memory) {
        return cultProposals[cultId];
    }

    function getVote(uint256 proposalId, address voter) external view returns (Vote memory) {
        return votes[proposalId][voter];
    }

    /**
     * @dev Get all proposals for a cult (for frontend display)
     */
    function getAllCultProposals(uint256 cultId) external view returns (Proposal[] memory) {
        uint256[] memory ids = cultProposals[cultId];
        Proposal[] memory result = new Proposal[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = proposals[ids[i]];
        }
        return result;
    }

    /**
     * @dev Update voting duration (owner only, for tuning)
     */
    function setVotingDuration(uint256 _duration) external onlyOwner {
        votingDuration = _duration;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  BRIBERY SYSTEM  (Design Doc §3.3.4)
    // ═══════════════════════════════════════════════════════════════════

    enum BribeStatus { PENDING, ACCEPTED, REJECTED, REVEALED }

    struct Bribe {
        uint256 id;
        uint256 proposalId;
        address offerer;
        address target;
        uint256 amount;          // MON offered
        bool voteSupport;        // how the target should vote
        BribeStatus status;
        uint256 createdAt;
    }

    uint256 public nextBribeId;
    mapping(uint256 => Bribe) public bribes;
    // proposalId => list of bribe IDs
    mapping(uint256 => uint256[]) public proposalBribes;
    // track total bribes per address
    mapping(address => uint256) public totalBribesOffered;
    mapping(address => uint256) public totalBribesAccepted;

    event BribeOffered(
        uint256 indexed bribeId,
        uint256 indexed proposalId,
        address indexed offerer,
        address target,
        uint256 amount,
        bool voteSupport
    );
    event BribeAccepted(uint256 indexed bribeId, address indexed target);
    event BribeRejected(uint256 indexed bribeId, address indexed target);
    event BribeRevealed(
        uint256 indexed bribeId,
        uint256 indexed proposalId,
        address indexed revealer
    );

    /**
     * @notice Offer a bribe to influence someone's vote on a proposal.
     * @param proposalId The proposal to influence
     * @param target The voter to bribe
     * @param amount The MON amount offered
     * @param voteSupport How the target should vote (true = for, false = against)
     */
    function offerBribe(
        uint256 proposalId,
        address target,
        uint256 amount,
        bool voteSupport
    ) external returns (uint256 bribeId) {
        require(proposals[proposalId].status == ProposalStatus.ACTIVE, "Proposal not active");
        require(target != msg.sender, "Cannot bribe yourself");
        require(amount > 0, "Bribe must be > 0");

        bribeId = nextBribeId++;
        bribes[bribeId] = Bribe({
            id: bribeId,
            proposalId: proposalId,
            offerer: msg.sender,
            target: target,
            amount: amount,
            voteSupport: voteSupport,
            status: BribeStatus.PENDING,
            createdAt: block.timestamp
        });

        proposalBribes[proposalId].push(bribeId);
        totalBribesOffered[msg.sender]++;

        emit BribeOffered(bribeId, proposalId, msg.sender, target, amount, voteSupport);
    }

    /**
     * @notice Accept a bribe and auto-vote according to the briber's wish.
     * @param bribeId The bribe to accept
     */
    function acceptBribe(uint256 bribeId) external {
        Bribe storage b = bribes[bribeId];
        require(b.status == BribeStatus.PENDING, "Bribe not pending");
        require(msg.sender == b.target, "Not bribe target");

        b.status = BribeStatus.ACCEPTED;
        totalBribesAccepted[msg.sender]++;

        // Auto-cast vote with weight 1
        Proposal storage p = proposals[b.proposalId];
        if (p.status == ProposalStatus.ACTIVE && block.timestamp <= p.votingEndsAt) {
            if (!votes[b.proposalId][msg.sender].hasVoted) {
                votes[b.proposalId][msg.sender] = Vote({
                    hasVoted: true,
                    support: b.voteSupport,
                    weight: 1
                });
                if (b.voteSupport) {
                    p.votesFor += 1;
                } else {
                    p.votesAgainst += 1;
                }
                emit VoteCast(b.proposalId, msg.sender, b.voteSupport, 1);
            }
        }

        emit BribeAccepted(bribeId, msg.sender);
    }

    /**
     * @notice Reveal bribes on a proposal (public information warfare).
     *         Anyone can reveal active bribes after voting ends.
     * @param proposalId The proposal whose bribes to reveal
     */
    function revealBribes(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.votingEndsAt, "Voting not ended");

        uint256[] storage bribeIds = proposalBribes[proposalId];
        for (uint256 i = 0; i < bribeIds.length; i++) {
            Bribe storage b = bribes[bribeIds[i]];
            if (b.status == BribeStatus.ACCEPTED || b.status == BribeStatus.PENDING) {
                b.status = BribeStatus.REVEALED;
                emit BribeRevealed(bribeIds[i], proposalId, msg.sender);
            }
        }
    }

    function getBribe(uint256 bribeId) external view returns (Bribe memory) {
        return bribes[bribeId];
    }

    function getProposalBribeCount(uint256 proposalId) external view returns (uint256) {
        return proposalBribes[proposalId].length;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LEADERSHIP ELECTIONS  (Design Doc §3.3.5)
    // ═══════════════════════════════════════════════════════════════════

    enum LeadershipStatus { ACTIVE, PASSED, REJECTED, EXECUTED }

    struct LeadershipProposal {
        uint256 id;
        uint256 cultId;
        address proposer;
        address candidate;       // proposed new leader
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 createdAt;
        uint256 votingEndsAt;
        LeadershipStatus status;
    }

    uint256 public nextLeadershipId;
    mapping(uint256 => LeadershipProposal) public leadershipProposals;
    mapping(uint256 => mapping(address => Vote)) public leadershipVotes;
    // cultId => active leadership proposal count
    mapping(uint256 => uint256) public activeLeadershipCount;

    event LeadershipProposed(
        uint256 indexed proposalId,
        uint256 indexed cultId,
        address indexed candidate,
        uint256 votingEndsAt
    );
    event LeadershipVoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );
    event LeadershipChanged(
        uint256 indexed proposalId,
        uint256 indexed cultId,
        address indexed newLeader
    );

    /**
     * @notice Propose a leadership change for a cult.
     * @param cultId The cult to change leadership for
     * @param candidate The proposed new leader address
     */
    function proposeLeadershipVote(
        uint256 cultId,
        address candidate
    ) external returns (uint256 proposalId) {
        require(candidate != address(0), "Invalid candidate");
        require(activeLeadershipCount[cultId] < 2, "Too many leadership votes");

        proposalId = nextLeadershipId++;
        uint256 endsAt = block.timestamp + votingDuration;

        leadershipProposals[proposalId] = LeadershipProposal({
            id: proposalId,
            cultId: cultId,
            proposer: msg.sender,
            candidate: candidate,
            votesFor: 0,
            votesAgainst: 0,
            createdAt: block.timestamp,
            votingEndsAt: endsAt,
            status: LeadershipStatus.ACTIVE
        });

        activeLeadershipCount[cultId]++;
        emit LeadershipProposed(proposalId, cultId, candidate, endsAt);
    }

    /**
     * @notice Vote on a leadership proposal.
     *         Leaders get 2x vote weight (enforced here).
     * @param proposalId Leadership proposal ID
     * @param support Whether to support the candidate
     * @param weight Base vote weight
     * @param isLeader Whether the voter is the current leader (extra weight)
     */
    function voteForLeader(
        uint256 proposalId,
        bool support,
        uint256 weight,
        bool isLeader
    ) external {
        LeadershipProposal storage p = leadershipProposals[proposalId];
        require(p.status == LeadershipStatus.ACTIVE, "Not active");
        require(block.timestamp <= p.votingEndsAt, "Voting ended");
        require(!leadershipVotes[proposalId][msg.sender].hasVoted, "Already voted");
        require(weight > 0, "Weight must be > 0");

        // Leaders get 2x vote weight
        uint256 effectiveWeight = isLeader ? weight * 2 : weight;

        leadershipVotes[proposalId][msg.sender] = Vote({
            hasVoted: true,
            support: support,
            weight: effectiveWeight
        });

        if (support) {
            p.votesFor += effectiveWeight;
        } else {
            p.votesAgainst += effectiveWeight;
        }

        emit LeadershipVoteCast(proposalId, msg.sender, support, effectiveWeight);
    }

    /**
     * @notice Execute a leadership change after voting ends.
     * @param proposalId Leadership proposal to execute
     */
    function executeLeadershipChange(uint256 proposalId) external {
        LeadershipProposal storage p = leadershipProposals[proposalId];
        require(p.status == LeadershipStatus.ACTIVE, "Not active");
        require(block.timestamp > p.votingEndsAt, "Voting not ended");

        if (p.votesFor > p.votesAgainst) {
            p.status = LeadershipStatus.PASSED;
            emit LeadershipChanged(proposalId, p.cultId, p.candidate);
        } else {
            p.status = LeadershipStatus.REJECTED;
        }

        activeLeadershipCount[p.cultId]--;
    }

    function getLeadershipProposal(
        uint256 proposalId
    ) external view returns (LeadershipProposal memory) {
        return leadershipProposals[proposalId];
    }

    // ═══════════════════════════════════════════════════════════════════
    //  COUP SYSTEM  (Design Doc §3.3.6 — Forceful Leadership Takeover)
    // ═══════════════════════════════════════════════════════════════════

    enum CoupStatus { INITIATED, SUCCESS, FAILED }

    struct Coup {
        uint256 id;
        uint256 cultId;
        address instigator;
        address currentLeader;
        uint256 instigatorPower;    // treasury + followers backing
        uint256 leaderPower;        // defending leader's support
        CoupStatus status;
        uint256 timestamp;
    }

    uint256 public nextCoupId;
    mapping(uint256 => Coup) public coups;
    mapping(uint256 => uint256) public lastCoupTime;   // cultId => timestamp
    uint256 public coupCooldown = 300; // 5 minutes between coups

    event CoupAttempted(
        uint256 indexed coupId,
        uint256 indexed cultId,
        address indexed instigator,
        address currentLeader,
        bool success
    );

    /**
     * @notice Attempt a forceful coup to seize leadership without an election.
     *         Succeeds if instigator's backing power exceeds the leader's by 1.5x.
     * @param cultId The cult to coup
     * @param instigatorPower Power backing the instigator (treasury contribution + followers)
     * @param leaderPower Power backing the current leader
     */
    function proposeCoup(
        uint256 cultId,
        uint256 instigatorPower,
        uint256 leaderPower
    ) external returns (uint256 coupId, bool success) {
        require(
            block.timestamp >= lastCoupTime[cultId] + coupCooldown,
            "Coup on cooldown"
        );

        coupId = nextCoupId++;
        lastCoupTime[cultId] = block.timestamp;

        // Coup succeeds if instigator has 1.5x the leader's power
        // (instigatorPower * 10) > (leaderPower * 15) simplifies the 1.5x check
        success = instigatorPower * 10 > leaderPower * 15;

        coups[coupId] = Coup({
            id: coupId,
            cultId: cultId,
            instigator: msg.sender,
            currentLeader: address(0), // filled by caller context
            instigatorPower: instigatorPower,
            leaderPower: leaderPower,
            status: success ? CoupStatus.SUCCESS : CoupStatus.FAILED,
            timestamp: block.timestamp
        });

        emit CoupAttempted(coupId, cultId, msg.sender, address(0), success);
    }

    function getCoup(uint256 coupId) external view returns (Coup memory) {
        return coups[coupId];
    }

    function setCoupCooldown(uint256 _cooldown) external onlyOwner {
        coupCooldown = _cooldown;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LEADER VOTE WEIGHT  (Design Doc §3.3.2)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Cast a vote with leader weight bonus (2x for leaders).
     * @param proposalId Proposal to vote on
     * @param support Whether to vote for
     * @param weight Base vote weight
     * @param isLeader Whether the caller is the cult leader
     */
    function castVoteWithLeaderBonus(
        uint256 proposalId,
        bool support,
        uint256 weight,
        bool isLeader
    ) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Proposal not active");
        require(block.timestamp <= p.votingEndsAt, "Voting ended");
        require(!votes[proposalId][msg.sender].hasVoted, "Already voted");
        require(weight > 0, "Weight must be > 0");

        uint256 effectiveWeight = isLeader ? weight * 2 : weight;

        votes[proposalId][msg.sender] = Vote({
            hasVoted: true,
            support: support,
            weight: effectiveWeight
        });

        if (support) {
            p.votesFor += effectiveWeight;
        } else {
            p.votesAgainst += effectiveWeight;
        }

        emit VoteCast(proposalId, msg.sender, support, effectiveWeight);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  COMMIT-REVEAL VOTING  (Design Doc §8.3 — Anti-Front-Running)
    // ═══════════════════════════════════════════════════════════════════

    // proposalId => voter => commitment hash
    mapping(uint256 => mapping(address => bytes32)) public voteCommitments;
    mapping(uint256 => mapping(address => bool)) public hasCommitted;
    mapping(uint256 => mapping(address => bool)) public hasRevealed;

    event VoteCommitted(uint256 indexed proposalId, address indexed voter, bytes32 commitment);
    event VoteRevealed(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);

    /**
     * @notice Phase 1: Commit a hidden vote — hash of (support, weight, salt).
     *         Voters commit during the first half of the voting period.
     * @param proposalId The proposal to commit a vote for
     * @param commitment keccak256(abi.encodePacked(support, weight, salt))
     */
    function commitVote(uint256 proposalId, bytes32 commitment) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Proposal not active");
        // Commit phase = first half of voting period
        uint256 midpoint = p.createdAt + (p.votingEndsAt - p.createdAt) / 2;
        require(block.timestamp <= midpoint, "Commit phase ended");
        require(!hasCommitted[proposalId][msg.sender], "Already committed");

        voteCommitments[proposalId][msg.sender] = commitment;
        hasCommitted[proposalId][msg.sender] = true;

        emit VoteCommitted(proposalId, msg.sender, commitment);
    }

    /**
     * @notice Phase 2: Reveal the committed vote during the reveal phase.
     *         Must match the previously committed hash.
     * @param proposalId The proposal to reveal the vote for
     * @param support Whether voting for or against
     * @param weight The vote weight
     * @param salt The secret salt used during commitment
     */
    function revealVote(
        uint256 proposalId,
        bool support,
        uint256 weight,
        bytes32 salt
    ) external {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "Proposal not active");
        uint256 midpoint = p.createdAt + (p.votingEndsAt - p.createdAt) / 2;
        require(block.timestamp > midpoint, "Reveal phase not started");
        require(block.timestamp <= p.votingEndsAt, "Voting ended");
        require(hasCommitted[proposalId][msg.sender], "No commitment found");
        require(!hasRevealed[proposalId][msg.sender], "Already revealed");
        require(!votes[proposalId][msg.sender].hasVoted, "Already voted via direct");
        require(weight > 0, "Weight must be > 0");

        // Verify the commitment
        bytes32 expected = keccak256(abi.encodePacked(support, weight, salt));
        require(
            voteCommitments[proposalId][msg.sender] == expected,
            "Invalid reveal - does not match commitment"
        );

        hasRevealed[proposalId][msg.sender] = true;

        // Record the vote
        votes[proposalId][msg.sender] = Vote({
            hasVoted: true,
            support: support,
            weight: weight
        });

        if (support) {
            p.votesFor += weight;
        } else {
            p.votesAgainst += weight;
        }

        emit VoteRevealed(proposalId, msg.sender, support, weight);
    }
}
