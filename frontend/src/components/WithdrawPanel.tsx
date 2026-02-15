"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePolling } from "@/hooks/usePolling";
import { api, AgentBalance, ManagedAgent } from "@/lib/api";
import {
  CULT_TOKEN_ADDRESS,
  CULT_TOKEN_ABI,
  MONAD_EXPLORER,
} from "@/lib/constants";

interface WithdrawPanelProps {
  agentId: number;
  agentName: string;
}

export function WithdrawPanel({ agentId, agentName }: WithdrawPanelProps) {
  const { address, connected, connect } = useWallet();
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  // Poll agent balance
  const { data: balance } = usePolling<AgentBalance>(
    useCallback(() => api.getAgentBalance(agentId), [agentId]),
    10000,
  );

  const handleWithdraw = async () => {
    if (!connected || !address) {
      connect();
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setWithdrawing(true);
    setError("");
    setTxHash("");

    try {
      const result = await api.withdrawFromAgent(agentId, {
        ownerAddress: address,
        amount,
      });

      setTxHash(result.txHash);
      setAmount("");
    } catch (err: any) {
      setError(err.message || "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleMaxClick = () => {
    if (balance) {
      setAmount(balance.cultBalance);
    }
  };

  return (
    <div className="border border-gray-800 rounded-xl p-5 bg-[#0d0d0d]">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        {agentName} — Wallet & Withdraw
      </h3>

      {/* Balance display */}
      {balance && (
        <div className="bg-gray-900 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">$CULT Balance</span>
            <span className="text-yellow-400 font-bold">
              {parseFloat(balance.cultBalance).toLocaleString()} CULT
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">MON Balance</span>
            <span className="text-white">
              {parseFloat(balance.monBalance).toFixed(4)} MON
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Wallet</span>
            <a
              href={`${MONAD_EXPLORER}/address/${balance.walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 font-mono text-xs underline"
            >
              {balance.walletAddress.slice(0, 8)}...
              {balance.walletAddress.slice(-6)}
            </a>
          </div>
        </div>
      )}

      {/* Withdraw form */}
      {connected && address ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                min="0"
                step="0.01"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none pr-14"
              />
              <button
                onClick={handleMaxClick}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
              >
                MAX
              </button>
            </div>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !amount}
              className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              {withdrawing ? "..." : "Withdraw"}
            </button>
          </div>

          <p className="text-[10px] text-gray-600">
            Only the deploying wallet ({address.slice(0, 6)}...
            {address.slice(-4)}) can withdraw.
          </p>
        </div>
      ) : (
        <button
          onClick={connect}
          className="w-full bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Connect Wallet to Withdraw
        </button>
      )}

      {/* Transaction result */}
      {txHash && (
        <div className="mt-3 bg-green-900/30 border border-green-700 rounded-lg p-3 text-center">
          <p className="text-green-400 text-xs mb-1">Withdrawal successful!</p>
          <a
            href={`${MONAD_EXPLORER}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-300 underline"
          >
            View transaction →
          </a>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
