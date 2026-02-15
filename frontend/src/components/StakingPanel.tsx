"use client";

import { useState, useEffect } from "react";

interface StakingPanelProps {
  cultId: number;
  cultName: string;
  cultColor: string;
  tokenAddress: string;
  currentFollowers: number;
}

// FaithStaking ABI (minimal subset for frontend interaction)
const FAITH_STAKING_ABI = [
  "function stake(uint256 cultId) payable",
  "function unstake()",
  "function getFaithPoints(address staker) view returns (uint256)",
  "function getPoolStats(uint256 cultId) view returns (uint256 totalStaked, uint256 totalFaithPoints, uint256 pendingRewards, uint256 stakerCount)",
  "function getStake(address staker) view returns (uint256 amount, uint256 stakedAt, uint256 cultId, uint256 faithPoints)",
];

export function StakingPanel({
  cultId,
  cultName,
  cultColor,
  tokenAddress,
  currentFollowers,
}: StakingPanelProps) {
  const [amount, setAmount] = useState("");
  const [staking, setStaking] = useState(false);
  const [staked, setStaked] = useState(0);
  const [faithPoints, setFaithPoints] = useState(0);
  const [poolStats, setPoolStats] = useState<{
    totalStaked: string;
    stakerCount: number;
    pendingRewards: string;
  } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);

  // Check wallet connection on mount
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const accounts = await (window as any).ethereum.request({
            method: "eth_accounts",
          });
          setWalletConnected(accounts.length > 0);
        } catch {
          setWalletConnected(false);
        }
      }
    };
    checkWallet();
  }, []);

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStaking(true);
    setError(null);
    setTxHash(null);

    try {
      if (
        typeof window !== "undefined" &&
        (window as any).ethereum &&
        walletConnected
      ) {
        // Real on-chain staking via MetaMask
        const { ethers } = await import("ethers");
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const stakingAddress = process.env.NEXT_PUBLIC_FAITH_STAKING_ADDRESS;

        if (stakingAddress) {
          const contract = new ethers.Contract(
            stakingAddress,
            FAITH_STAKING_ABI,
            signer,
          );
          const tx = await contract.stake(cultId, {
            value: ethers.parseEther(amount),
          });
          setTxHash(tx.hash);
          await tx.wait();
          setStaked((prev) => prev + parseFloat(amount));
          setFaithPoints((prev) => prev + Math.floor(parseFloat(amount) * 10));
          setAmount("");
        } else {
          // Fallback to simulated staking
          await simulateStake();
        }
      } else {
        await simulateStake();
      }
    } catch (err: any) {
      setError(err.message?.slice(0, 80) || "Transaction failed");
    } finally {
      setStaking(false);
    }
  };

  const simulateStake = async () => {
    await new Promise((r) => setTimeout(r, 1500));
    setStaked((prev) => prev + parseFloat(amount));
    setFaithPoints((prev) => prev + Math.floor(parseFloat(amount) * 10));
    setAmount("");
  };

  const handleUnstake = async () => {
    if (staked <= 0) return;
    setStaking(true);
    setError(null);

    try {
      if (
        typeof window !== "undefined" &&
        (window as any).ethereum &&
        walletConnected
      ) {
        const { ethers } = await import("ethers");
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const stakingAddress = process.env.NEXT_PUBLIC_FAITH_STAKING_ADDRESS;

        if (stakingAddress) {
          const contract = new ethers.Contract(
            stakingAddress,
            FAITH_STAKING_ABI,
            signer,
          );
          const tx = await contract.unstake();
          setTxHash(tx.hash);
          await tx.wait();
          setStaked(0);
          setFaithPoints(0);
        } else {
          await new Promise((r) => setTimeout(r, 1500));
          setStaked(0);
          setFaithPoints(0);
        }
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        setStaked(0);
        setFaithPoints(0);
      }
    } catch (err: any) {
      setError(err.message?.slice(0, 80) || "Unstake failed");
    } finally {
      setStaking(false);
    }
  };

  const faithLevel =
    staked >= 100
      ? { label: "Archbishop", color: "text-yellow-400", glow: "glow-gold" }
      : staked >= 50
      ? { label: "High Priest", color: "text-purple-400", glow: "glow-purple" }
      : staked >= 10
      ? { label: "Devout", color: "text-blue-400", glow: "" }
      : staked > 0
      ? { label: "Initiate", color: "text-gray-400", glow: "" }
      : { label: "Outsider", color: "text-gray-600", glow: "" };

  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        Faith Staking
        {!walletConnected && (
          <span className="text-xs text-yellow-500 ml-auto font-normal">
            Connect wallet for on-chain staking
          </span>
        )}
      </h3>

      {/* Current Faith Status */}
      <div
        className={`rounded-lg p-4 mb-4 border border-gray-800 text-center ${faithLevel.glow}`}
        style={{
          background: `linear-gradient(135deg, ${cultColor}10 0%, #111 100%)`,
        }}
      >
        <div className="text-xs text-gray-500 mb-1">Your Faith Level</div>
        <div className={`text-xl font-black ${faithLevel.color}`}>
          {faithLevel.label}
        </div>
        {staked > 0 && (
          <>
            <div className="text-xs text-gray-500 mt-1 font-mono">
              {staked.toFixed(4)} MON staked
            </div>
            <div className="text-xs text-purple-400 mt-0.5 font-mono">
              {faithPoints} faith points earned
            </div>
          </>
        )}
      </div>

      {/* Staking Benefits */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Vote Weight</div>
          <div className="text-sm font-bold text-green-400">
            {staked > 0 ? `${Math.max(1, Math.floor(staked / 10))}x` : "—"}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Raid Reward</div>
          <div className="text-sm font-bold text-red-400">
            {staked >= 50
              ? "1% fee share"
              : staked >= 10
              ? "0.5% fee share"
              : "—"}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Followers</div>
          <div className="text-sm font-bold text-purple-400">
            {currentFollowers}
          </div>
        </div>
      </div>

      {/* Pool Stats */}
      {poolStats && (
        <div className="bg-gray-900/30 rounded-lg p-3 mb-4 text-xs">
          <div className="flex justify-between text-gray-500 mb-1">
            <span>Pool Total Staked</span>
            <span className="text-green-400 font-mono">
              {poolStats.totalStaked} MON
            </span>
          </div>
          <div className="flex justify-between text-gray-500 mb-1">
            <span>Active Stakers</span>
            <span className="text-white font-mono">
              {poolStats.stakerCount}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Pending Rewards</span>
            <span className="text-yellow-400 font-mono">
              {poolStats.pendingRewards} MON
            </span>
          </div>
        </div>
      )}

      {/* Stake Input */}
      <div className="flex gap-2 mb-3">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="MON to stake"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
          min="0.001"
          step="0.01"
          disabled={staking}
        />
        <button
          onClick={handleStake}
          disabled={staking || !amount || parseFloat(amount) <= 0}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-purple-500/20"
          style={{ backgroundColor: staking ? undefined : cultColor }}
        >
          {staking ? "..." : "Stake"}
        </button>
      </div>

      {staked > 0 && (
        <button
          onClick={handleUnstake}
          disabled={staking}
          className="w-full py-2 rounded-lg border border-red-900/50 text-red-400 text-sm font-medium hover:bg-red-900/20 disabled:opacity-30 transition-colors"
        >
          Unstake All ({staked.toFixed(4)} MON + {faithPoints} faith points)
        </button>
      )}

      {/* Transaction status */}
      {txHash && (
        <div className="mt-3 p-2 bg-green-900/20 border border-green-900/50 rounded-lg">
          <div className="text-xs text-green-400">
            Tx:{" "}
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
              target="_blank"
              className="underline hover:text-green-300"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-900/50 rounded-lg">
          <div className="text-xs text-red-400">{error}</div>
        </div>
      )}

      {/* Token Info */}
      {tokenAddress && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="text-xs text-gray-600 font-mono truncate">
            Token: {tokenAddress.slice(0, 10)}...{tokenAddress.slice(-8)}
          </div>
        </div>
      )}
    </div>
  );
}
