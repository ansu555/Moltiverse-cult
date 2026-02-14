// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EconomyEngine
 * @notice Manages protocol-level economics: fees, treasury operations, burn mechanics,
 *         and death-spiral enforcement.
 * @dev Per design doc economy.md §1 — token flow, protocol fees, operational costs.
 */
contract EconomyEngine {

    // ── Structs ────────────────────────────────────────────────────────
    struct TreasurySnapshot {
        uint256 cultId;
        uint256 balance;
        uint256 lastUpdated;
        uint256 totalInflow;
        uint256 totalOutflow;
        uint256 tickBurnAccumulated;
        bool alive;
    }

    // ── State ──────────────────────────────────────────────────────────
    address public owner;

    // Protocol parameters
    uint256 public protocolFeeBps = 100;       // 1% = 100 basis points
    uint256 public tickBurnRate = 5e13;        // 0.00005 MON per tick (halved for non-zero-sum)
    uint256 public deathCooldown = 5 minutes;  // Time before rebirth is allowed
    uint256 public rebirthMinFunding = 1e16;   // 0.01 MON minimum to resurrect

    // Treasury tracking
    mapping(uint256 => TreasurySnapshot) public treasuries;
    uint256 public totalProtocolFees;
    uint256 public totalBurned;

    // Death tracking
    mapping(uint256 => uint256) public deathTimestamp; // cultId -> when they died
    mapping(uint256 => uint256) public deathCount;     // cultId -> total deaths
    uint256 public totalDeaths;

    // Revenue tracking
    mapping(uint256 => uint256) public raidRevenue;    // cultId -> total earned from raids
    mapping(uint256 => uint256) public stakingRevenue;  // cultId -> total from staking

    // ── Non-Zero-Sum: Yield Engine ─────────────────────────────────────
    // Productivity-based yield: active cults earn more than they burn
    uint256 public yieldPerFollower = 1e12;    // 0.000001 MON per follower per harvest
    uint256 public yieldPerStakedMon = 5e11;   // 0.0000005 MON per staked MON per harvest
    uint256 public yieldAccuracyBonus = 2e12;  // 0.000002 MON bonus per correct prophecy
    uint256 public maxYieldPerHarvest = 1e16;  // 0.01 MON cap per harvest (anti-inflation)
    mapping(uint256 => uint256) public lastHarvestTime;  // cultId -> last harvest timestamp
    mapping(uint256 => uint256) public totalYieldEarned; // cultId -> lifetime yield
    uint256 public totalYieldMinted;           // global yield minted (new value created)

    // ── Non-Zero-Sum: Prophecy Reward Pool ─────────────────────────────
    // Funded by protocol fees, distributed to cults with accurate prophecies
    uint256 public prophecyRewardPool;
    uint256 public prophecyRewardPerCorrect = 5e14; // 0.0005 MON per correct prophecy
    mapping(uint256 => uint256) public prophecyAccuracy; // cultId -> correct prophecy count
    uint256 public totalProphecyRewards;

    // ── Non-Zero-Sum: Protocol Fee Distribution ────────────────────────
    // Fees are recycled back into the economy instead of purely extracted
    uint256 public feeToPoolBps = 4000;    // 40% -> prophecy reward pool
    uint256 public feeToYieldBps = 3000;   // 30% -> yield subsidies
    uint256 public feeToBurnBps = 3000;    // 30% -> burned (deflationary pressure)
    uint256 public undistributedFees;       // fees waiting to be distributed
    uint256 public yieldSubsidyPool;        // funded by protocol fees, boosts yield

    // ── Events ─────────────────────────────────────────────────────────
    event TreasuryInitialized(uint256 indexed cultId, uint256 balance);
    event ProtocolFeeCollected(uint256 indexed cultId, uint256 amount, uint256 totalCollected);
    event TickBurnApplied(uint256 indexed cultId, uint256 burnAmount, uint256 newBalance);
    event InflowRecorded(uint256 indexed cultId, uint256 amount, string source);
    event OutflowRecorded(uint256 indexed cultId, uint256 amount, string reason);
    event CultDied(uint256 indexed cultId, uint256 timestamp, uint256 deathNumber);
    event CultReborn(uint256 indexed cultId, uint256 newBalance, uint256 timestamp);
    event ProtocolFeeUpdated(uint256 oldBps, uint256 newBps);
    event TickBurnRateUpdated(uint256 oldRate, uint256 newRate);
    event YieldHarvested(uint256 indexed cultId, uint256 yieldAmount, uint256 productivity);
    event ProphecyPoolFunded(uint256 amount, uint256 newPoolBalance);
    event ProphecyRewardClaimed(uint256 indexed cultId, uint256 amount);
    event ProtocolFeesDistributed(uint256 toPool, uint256 toYield, uint256 toBurn);
    event YieldSubsidyApplied(uint256 indexed cultId, uint256 amount);

    // ── Modifiers ──────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier cultAlive(uint256 cultId) {
        require(treasuries[cultId].alive, "Cult is dead");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Treasury Initialization ────────────────────────────────────────

    /**
     * @notice Initialize a treasury for a newly registered cult
     * @param cultId Cult ID
     * @param initialBalance Starting balance
     */
    function initTreasury(
        uint256 cultId,
        uint256 initialBalance
    ) external onlyOwner {
        require(treasuries[cultId].lastUpdated == 0, "Already initialized");

        treasuries[cultId] = TreasurySnapshot({
            cultId: cultId,
            balance: initialBalance,
            lastUpdated: block.timestamp,
            totalInflow: initialBalance,
            totalOutflow: 0,
            tickBurnAccumulated: 0,
            alive: true
        });

        emit TreasuryInitialized(cultId, initialBalance);
    }

    // ── Protocol Fee Collection ────────────────────────────────────────

    /**
     * @notice Collect protocol fee on a transfer amount
     * @param cultId Cult involved in the transfer
     * @param amount Total transfer amount
     * @return fee The fee collected
     * @return netAmount Amount after fee
     */
    function collectFee(
        uint256 cultId,
        uint256 amount
    ) external onlyOwner returns (uint256 fee, uint256 netAmount) {
        fee = (amount * protocolFeeBps) / 10000;
        netAmount = amount - fee;

        totalProtocolFees += fee;
        undistributedFees += fee; // queue for redistribution

        emit ProtocolFeeCollected(cultId, fee, totalProtocolFees);
    }

    // ── Tick Burn (Operational Cost) ───────────────────────────────────

    /**
     * @notice Apply operational burn for a tick cycle
     * @param cultId Cult to burn from
     * @return burned Amount burned
     * @return died Whether the cult died from this burn
     */
    function applyTickBurn(
        uint256 cultId
    ) external onlyOwner cultAlive(cultId) returns (uint256 burned, bool died) {
        TreasurySnapshot storage t = treasuries[cultId];

        if (t.balance <= tickBurnRate) {
            // Death spiral: treasury depleted
            burned = t.balance;
            t.balance = 0;
            t.tickBurnAccumulated += burned;
            t.totalOutflow += burned;
            t.alive = false;
            t.lastUpdated = block.timestamp;

            deathTimestamp[cultId] = block.timestamp;
            deathCount[cultId]++;
            totalDeaths++;
            totalBurned += burned;

            emit TickBurnApplied(cultId, burned, 0);
            emit CultDied(cultId, block.timestamp, deathCount[cultId]);

            return (burned, true);
        }

        burned = tickBurnRate;
        t.balance -= burned;
        t.tickBurnAccumulated += burned;
        t.totalOutflow += burned;
        t.lastUpdated = block.timestamp;
        totalBurned += burned;

        emit TickBurnApplied(cultId, burned, t.balance);
        return (burned, false);
    }

    // ── Inflow / Outflow Tracking ──────────────────────────────────────

    /**
     * @notice Record an inflow (raid spoils, staking rewards, funding)
     */
    function recordInflow(
        uint256 cultId,
        uint256 amount,
        string calldata source
    ) external onlyOwner cultAlive(cultId) {
        TreasurySnapshot storage t = treasuries[cultId];
        t.balance += amount;
        t.totalInflow += amount;
        t.lastUpdated = block.timestamp;

        // Track revenue by source
        bytes32 h = keccak256(bytes(source));
        if (h == keccak256("raid")) {
            raidRevenue[cultId] += amount;
        } else if (h == keccak256("staking")) {
            stakingRevenue[cultId] += amount;
        }

        emit InflowRecorded(cultId, amount, source);
    }

    /**
     * @notice Record an outflow (raid wager, expense)
     */
    function recordOutflow(
        uint256 cultId,
        uint256 amount,
        string calldata reason
    ) external onlyOwner cultAlive(cultId) {
        TreasurySnapshot storage t = treasuries[cultId];
        require(t.balance >= amount, "Insufficient treasury");

        t.balance -= amount;
        t.totalOutflow += amount;
        t.lastUpdated = block.timestamp;

        // Check death condition
        if (t.balance == 0) {
            t.alive = false;
            deathTimestamp[cultId] = block.timestamp;
            deathCount[cultId]++;
            totalDeaths++;
            emit CultDied(cultId, block.timestamp, deathCount[cultId]);
        }

        emit OutflowRecorded(cultId, amount, reason);
    }

    // ── Rebirth ────────────────────────────────────────────────────────

    /**
     * @notice Resurrect a dead cult with new funding
     * @param cultId Cult to resurrect
     * @param newFunding Amount of new funding
     */
    function rebirth(
        uint256 cultId,
        uint256 newFunding
    ) external onlyOwner {
        require(!treasuries[cultId].alive, "Cult still alive");
        require(deathTimestamp[cultId] > 0, "Never died");
        require(
            block.timestamp >= deathTimestamp[cultId] + deathCooldown,
            "Cooldown not over"
        );
        require(newFunding >= rebirthMinFunding, "Below minimum funding");

        TreasurySnapshot storage t = treasuries[cultId];
        t.balance = newFunding;
        t.totalInflow += newFunding;
        t.alive = true;
        t.lastUpdated = block.timestamp;

        emit CultReborn(cultId, newFunding, block.timestamp);
    }

    // ── Health Analytics ───────────────────────────────────────────────

    /**
     * @notice Estimate runway (ticks until death) for a cult
     * @param cultId Cult to analyze
     * @return ticks Estimated ticks remaining
     */
    function estimateRunway(uint256 cultId) external view returns (uint256 ticks) {
        TreasurySnapshot storage t = treasuries[cultId];
        if (!t.alive || tickBurnRate == 0) return type(uint256).max;
        return t.balance / tickBurnRate;
    }

    /**
     * @notice Check if a cult can be reborn
     */
    function canRebirth(uint256 cultId) external view returns (bool) {
        if (treasuries[cultId].alive) return false;
        if (deathTimestamp[cultId] == 0) return false;
        return block.timestamp >= deathTimestamp[cultId] + deathCooldown;
    }

    // ── Admin ──────────────────────────────────────────────────────────

    function setProtocolFeeBps(uint256 newBps) external onlyOwner {
        require(newBps <= 500, "Max 5%");
        emit ProtocolFeeUpdated(protocolFeeBps, newBps);
        protocolFeeBps = newBps;
    }

    function setTickBurnRate(uint256 newRate) external onlyOwner {
        emit TickBurnRateUpdated(tickBurnRate, newRate);
        tickBurnRate = newRate;
    }

    function setDeathCooldown(uint256 newCooldown) external onlyOwner {
        deathCooldown = newCooldown;
    }

    function setRebirthMinFunding(uint256 newMin) external onlyOwner {
        rebirthMinFunding = newMin;
    }

    // ── View Functions ─────────────────────────────────────────────────

    function getTreasury(uint256 cultId) external view returns (TreasurySnapshot memory) {
        return treasuries[cultId];
    }

    function getProtocolStats() external view returns (
        uint256 fees,
        uint256 burned,
        uint256 deaths
    ) {
        return (totalProtocolFees, totalBurned, totalDeaths);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SELECTIVE BALANCE VISIBILITY  (Design Doc §3.4.3)
    // ═══════════════════════════════════════════════════════════════════

    // cultId => viewerCultId => allowed
    mapping(uint256 => mapping(uint256 => bool)) public balanceViewPermissions;

    event BalanceViewGranted(uint256 indexed cultId, uint256 indexed viewerCultId);
    event BalanceViewRevoked(uint256 indexed cultId, uint256 indexed viewerCultId);

    /**
     * @notice Grant another cult permission to view your treasury balance
     */
    function grantBalanceView(
        uint256 cultId,
        uint256 viewerCultId
    ) external onlyOwner {
        require(cultId != viewerCultId, "Cannot grant view to self");
        balanceViewPermissions[cultId][viewerCultId] = true;
        emit BalanceViewGranted(cultId, viewerCultId);
    }

    /**
     * @notice Revoke another cult's permission to view your treasury
     */
    function revokeBalanceView(
        uint256 cultId,
        uint256 viewerCultId
    ) external onlyOwner {
        balanceViewPermissions[cultId][viewerCultId] = false;
        emit BalanceViewRevoked(cultId, viewerCultId);
    }

    /**
     * @notice Check if a cult can view another cult's balance
     */
    function canViewBalance(
        uint256 cultId,
        uint256 viewerCultId
    ) external view returns (bool) {
        return balanceViewPermissions[cultId][viewerCultId];
    }

    /**
     * @notice Get balance of a cult, only if viewer has permission
     * @return balance The balance (0 if no permission)
     * @return hasPermission Whether the viewer has access
     */
    function getVisibleBalance(
        uint256 cultId,
        uint256 viewerCultId
    ) external view returns (uint256 balance, bool hasPermission) {
        if (balanceViewPermissions[cultId][viewerCultId]) {
            return (treasuries[cultId].balance, true);
        }
        return (0, false);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FUND LOCKING  (Design Doc §3.4.4 — Raid Escrow)
    // ═══════════════════════════════════════════════════════════════════

    // cultId => locked amount
    mapping(uint256 => uint256) public lockedBalance;

    event FundsLocked(uint256 indexed cultId, uint256 amount, string reason);
    event FundsReleased(uint256 indexed cultId, uint256 amount);

    /**
     * @notice Lock funds for raid escrow or bets
     */
    function lockFunds(
        uint256 cultId,
        uint256 amount,
        string calldata reason
    ) external onlyOwner cultAlive(cultId) {
        TreasurySnapshot storage t = treasuries[cultId];
        uint256 available = t.balance - lockedBalance[cultId];
        require(amount <= available, "Insufficient unlocked funds");

        lockedBalance[cultId] += amount;
        emit FundsLocked(cultId, amount, reason);
    }

    /**
     * @notice Release previously locked funds
     */
    function releaseFunds(
        uint256 cultId,
        uint256 amount
    ) external onlyOwner {
        require(lockedBalance[cultId] >= amount, "Not enough locked");
        lockedBalance[cultId] -= amount;
        emit FundsReleased(cultId, amount);
    }

    /**
     * @notice Get available (unlocked) balance for a cult
     */
    function getAvailableBalance(uint256 cultId) external view returns (uint256) {
        if (!treasuries[cultId].alive) return 0;
        return treasuries[cultId].balance - lockedBalance[cultId];
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INTER-CULT TRANSFERS  (Design Doc §3.4.5)
    // ═══════════════════════════════════════════════════════════════════

    enum TransferType { RAID_SPOILS, BRIBE, TRIBUTE, DONATION }

    event InterCultTransfer(
        uint256 indexed fromCultId,
        uint256 indexed toCultId,
        uint256 amount,
        TransferType transferType,
        uint256 timestamp
    );

    /**
     * @notice Transfer funds between cults with typed reason
     */
    function transferFunds(
        uint256 fromCultId,
        uint256 toCultId,
        uint256 amount,
        TransferType transferType
    ) external onlyOwner {
        require(fromCultId != toCultId, "Cannot transfer to self");
        TreasurySnapshot storage from = treasuries[fromCultId];
        TreasurySnapshot storage to = treasuries[toCultId];
        require(from.alive, "Source cult dead");
        require(to.alive, "Target cult dead");

        uint256 available = from.balance - lockedBalance[fromCultId];
        require(amount <= available, "Insufficient available funds");

        from.balance -= amount;
        from.totalOutflow += amount;
        to.balance += amount;
        to.totalInflow += amount;

        from.lastUpdated = block.timestamp;
        to.lastUpdated = block.timestamp;

        // Check death
        if (from.balance == 0) {
            from.alive = false;
            deathTimestamp[fromCultId] = block.timestamp;
            deathCount[fromCultId]++;
            totalDeaths++;
            emit CultDied(fromCultId, block.timestamp, deathCount[fromCultId]);
        }

        emit InterCultTransfer(fromCultId, toCultId, amount, transferType, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  NON-ZERO-SUM: YIELD ENGINE  (Productivity-Based Value Creation)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Harvest yield for a cult based on its productivity score.
     *         Active cults earn new value; idle cults still lose to tick burn.
     *         Yield = f(followers, staked amount, prophecy accuracy)
     *         Uses sqrt-like diminishing returns to prevent runaway inflation.
     * @param cultId The cult harvesting yield
     * @param followerCount Current number of followers
     * @param totalStaked Total MON staked on this cult via FaithStaking
     * @param correctProphecies Number of correct prophecies this cult has made
     * @return yieldAmount The new value created and added to treasury
     */
    function harvestYield(
        uint256 cultId,
        uint256 followerCount,
        uint256 totalStaked,
        uint256 correctProphecies
    ) external onlyOwner cultAlive(cultId) returns (uint256 yieldAmount) {
        require(
            block.timestamp >= lastHarvestTime[cultId] + 60,
            "Harvest cooldown: 1 min"
        );

        // Calculate raw productivity
        uint256 followerYield = followerCount * yieldPerFollower;
        uint256 stakeYield = (totalStaked * yieldPerStakedMon) / 1 ether;
        uint256 prophecyYield = correctProphecies * yieldAccuracyBonus;

        uint256 rawYield = followerYield + stakeYield + prophecyYield;

        // Diminishing returns: sqrt approximation via Babylonian method
        // yield = sqrt(rawYield * 1e18) to dampen exponential growth
        if (rawYield > 0) {
            yieldAmount = _sqrt(rawYield * 1e18);
        }

        // Add yield subsidy bonus if pool has funds
        if (yieldSubsidyPool > 0 && yieldAmount > 0) {
            uint256 subsidy = yieldAmount / 5; // 20% bonus from subsidy pool
            if (subsidy > yieldSubsidyPool) subsidy = yieldSubsidyPool;
            yieldSubsidyPool -= subsidy;
            yieldAmount += subsidy;
            emit YieldSubsidyApplied(cultId, subsidy);
        }

        // Cap per harvest to prevent inflation spikes
        if (yieldAmount > maxYieldPerHarvest) {
            yieldAmount = maxYieldPerHarvest;
        }

        // Credit the treasury (NEW VALUE CREATED — non-zero-sum)
        if (yieldAmount > 0) {
            TreasurySnapshot storage t = treasuries[cultId];
            t.balance += yieldAmount;
            t.totalInflow += yieldAmount;
            t.lastUpdated = block.timestamp;

            totalYieldEarned[cultId] += yieldAmount;
            totalYieldMinted += yieldAmount;
        }

        lastHarvestTime[cultId] = block.timestamp;

        emit YieldHarvested(cultId, yieldAmount, rawYield);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  NON-ZERO-SUM: PROPHECY REWARD POOL
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Record a correct prophecy for yield calculation and claim reward.
     * @param cultId The cult that made the correct prophecy
     * @return reward Amount drawn from the prophecy pool
     */
    function claimProphecyReward(
        uint256 cultId
    ) external onlyOwner cultAlive(cultId) returns (uint256 reward) {
        prophecyAccuracy[cultId]++;

        reward = prophecyRewardPerCorrect;
        if (reward > prophecyRewardPool) {
            reward = prophecyRewardPool; // can't exceed pool
        }

        if (reward > 0) {
            prophecyRewardPool -= reward;
            TreasurySnapshot storage t = treasuries[cultId];
            t.balance += reward;
            t.totalInflow += reward;
            t.lastUpdated = block.timestamp;
            totalProphecyRewards += reward;
        }

        emit ProphecyRewardClaimed(cultId, reward);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  NON-ZERO-SUM: PROTOCOL FEE RECYCLING
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute accumulated protocol fees back into the economy.
     *         40% → prophecy reward pool (rewards accuracy)
     *         30% → yield subsidy pool (boosts productive cults)
     *         30% → burned (maintains some deflation)
     */
    function distributeProtocolFees() external onlyOwner {
        uint256 fees = undistributedFees;
        require(fees > 0, "No fees to distribute");

        uint256 toPool = (fees * feeToPoolBps) / 10000;
        uint256 toYield = (fees * feeToYieldBps) / 10000;
        uint256 toBurn = fees - toPool - toYield;

        prophecyRewardPool += toPool;
        yieldSubsidyPool += toYield;
        totalBurned += toBurn;
        undistributedFees = 0;

        emit ProtocolFeesDistributed(toPool, toYield, toBurn);
        emit ProphecyPoolFunded(toPool, prophecyRewardPool);
    }

    // ── Babylonian sqrt (for diminishing returns) ──────────────────────

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // ── Non-Zero-Sum Admin ─────────────────────────────────────────────

    function setYieldPerFollower(uint256 newRate) external onlyOwner {
        yieldPerFollower = newRate;
    }

    function setYieldPerStakedMon(uint256 newRate) external onlyOwner {
        yieldPerStakedMon = newRate;
    }

    function setMaxYieldPerHarvest(uint256 newMax) external onlyOwner {
        maxYieldPerHarvest = newMax;
    }

    function setProphecyRewardPerCorrect(uint256 newReward) external onlyOwner {
        prophecyRewardPerCorrect = newReward;
    }

    function setFeeDistribution(
        uint256 poolBps,
        uint256 yieldBps,
        uint256 burnBps
    ) external onlyOwner {
        require(poolBps + yieldBps + burnBps == 10000, "Must sum to 100%");
        feeToPoolBps = poolBps;
        feeToYieldBps = yieldBps;
        feeToBurnBps = burnBps;
    }

    function getNonZeroSumStats() external view returns (
        uint256 yieldMinted,
        uint256 prophecyPool,
        uint256 subsidyPool,
        uint256 prophecyRewardsDistributed,
        uint256 burned
    ) {
        return (
            totalYieldMinted,
            prophecyRewardPool,
            yieldSubsidyPool,
            totalProphecyRewards,
            totalBurned
        );
    }
}
