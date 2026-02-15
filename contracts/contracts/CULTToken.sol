// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CULTToken
 * @notice ERC-20 token for AgentCult ecosystem.
 *
 * Supply:  100,000,000 CULT (fixed on mainnet; testnet has faucet mint).
 * Decimals: 18
 *
 * Deployment-fee flow (enforced off-chain for flexibility):
 *   100 CULT to deploy an agent → 30 burned, 50 treasury, 20 staking pool.
 *
 * Testnet-only:
 *   • `faucet(address, amount)` — owner-gated mint for testers.
 *   • Rate-limit: 1 000 CULT per address per 24 h.
 *
 * Mainnet migration: remove faucet, disable mint (no new supply).
 */
contract CULTToken {
    // ── ERC-20 storage ──────────────────────────────────────────────
    string public constant name = "Mocult Token";
    string public constant symbol = "CULT";
    uint8  public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Ownership ───────────────────────────────────────────────────
    address public owner;
    address public pendingOwner;

    // ── Faucet rate-limit (testnet only) ────────────────────────────
    uint256 public constant FAUCET_COOLDOWN   = 24 hours;
    uint256 public constant FAUCET_MAX_AMOUNT = 1_000 * 1e18; // 1 000 CULT
    mapping(address => uint256) public lastFaucetClaim;

    // ── Protocol addresses (set after deploy) ───────────────────────
    address public burnAddress; // address(0) or explicit dead address
    address public stakingPool;

    // ── Events ──────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event FaucetClaimed(address indexed to, uint256 amount);
    event DeployFeePaid(address indexed deployer, uint256 burned, uint256 treasury, uint256 staking);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Modifiers ───────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "CULTToken: not owner");
        _;
    }

    // ── Constructor ─────────────────────────────────────────────────
    /**
     * @param initialMintTo  Address to receive the full 100M initial supply.
     *                       On mainnet this is the protocol multisig;
     *                       on testnet it can be the deployer.
     */
    constructor(address initialMintTo) {
        require(initialMintTo != address(0), "CULTToken: zero mint target");
        owner = msg.sender;

        uint256 initialSupply = 100_000_000 * 1e18; // 100 M
        totalSupply = initialSupply;
        balanceOf[initialMintTo] = initialSupply;
        emit Transfer(address(0), initialMintTo, initialSupply);
    }

    // ── ERC-20 core ─────────────────────────────────────────────────
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "CULTToken: allowance exceeded");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    // ── Burn ────────────────────────────────────────────────────────
    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "CULTToken: insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    // ── Deploy-fee helper (callable by anyone — frontend calls it) ──
    /**
     * @notice Pay the 100 CULT agent-deploy fee in one transaction.
     *         30 burned, 50 to treasury (target), 20 to staking pool.
     * @param treasuryTarget Where the 50 CULT treasury portion goes
     *                       (usually the new agent's wallet).
     */
    function payDeployFee(address treasuryTarget) external {
        uint256 fee = 100 * 1e18;
        require(balanceOf[msg.sender] >= fee, "CULTToken: insufficient CULT for deploy fee");
        require(treasuryTarget != address(0), "CULTToken: zero treasury target");

        // 30 burned
        uint256 burnAmt = 30 * 1e18;
        balanceOf[msg.sender] -= burnAmt;
        totalSupply -= burnAmt;
        emit Transfer(msg.sender, address(0), burnAmt);

        // 50 to agent treasury
        uint256 treasuryAmt = 50 * 1e18;
        balanceOf[msg.sender] -= treasuryAmt;
        balanceOf[treasuryTarget] += treasuryAmt;
        emit Transfer(msg.sender, treasuryTarget, treasuryAmt);

        // 20 to staking pool (or owner if pool not set)
        uint256 stakingAmt = 20 * 1e18;
        address stakingDest = stakingPool != address(0) ? stakingPool : owner;
        balanceOf[msg.sender] -= stakingAmt;
        balanceOf[stakingDest] += stakingAmt;
        emit Transfer(msg.sender, stakingDest, stakingAmt);

        emit DeployFeePaid(msg.sender, burnAmt, treasuryAmt, stakingAmt);
    }

    // ── Faucet (testnet only) ───────────────────────────────────────
    /**
     * @notice Owner-gated mint for testers. Rate-limited to 1 000 CULT / 24 h.
     *         On mainnet migration, remove this function or make it a no-op.
     */
    function faucet(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "CULTToken: zero address");
        require(amount <= FAUCET_MAX_AMOUNT, "CULTToken: exceeds faucet max");
        require(
            block.timestamp >= lastFaucetClaim[to] + FAUCET_COOLDOWN,
            "CULTToken: faucet cooldown active"
        );

        lastFaucetClaim[to] = block.timestamp;
        totalSupply += amount;
        balanceOf[to] += amount;

        emit Transfer(address(0), to, amount);
        emit FaucetClaimed(to, amount);
    }

    // ── Admin ───────────────────────────────────────────────────────
    function setStakingPool(address pool) external onlyOwner {
        stakingPool = pool;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "CULTToken: not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ── Internal ────────────────────────────────────────────────────
    function _transfer(address from, address to, uint256 value) internal {
        require(from != address(0), "CULTToken: transfer from zero");
        require(to != address(0), "CULTToken: transfer to zero");
        require(balanceOf[from] >= value, "CULTToken: insufficient balance");

        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
