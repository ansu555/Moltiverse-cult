"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, FaucetStatus, getApiErrorMessage, isApiError } from "@/lib/api";
import { CULT_TOKEN_ADDRESS, MONAD_EXPLORER } from "@/lib/constants";
import { useWallet } from "@/hooks/useWallet";

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatNextClaim(nextClaimAt: number | null): string {
  if (!nextClaimAt) return "-";
  return new Date(nextClaimAt).toLocaleString();
}

export default function FaucetPage() {
  const { address, connected, connect } = useWallet();
  const [amount, setAmount] = useState("1000");
  const [claiming, setClaiming] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [now, setNow] = useState(Date.now());

  const refreshFaucetStatus = useCallback(async () => {
    if (!connected || !address) {
      setFaucetStatus(null);
      return;
    }

    setStatusLoading(true);
    try {
      const status = await api.getFaucetStatus(address);
      setFaucetStatus(status);
    } catch (statusError) {
      if (
        isApiError(statusError) &&
        statusError.code === "TOKEN_NOT_CONFIGURED"
      ) {
        setError("$CULT token not configured");
      }
      setFaucetStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [address, connected]);

  useEffect(() => {
    refreshFaucetStatus().catch(() => {});
  }, [refreshFaucetStatus]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!faucetStatus || faucetStatus.claimable) return 0;
    if (faucetStatus.nextClaimAt) {
      return Math.max(0, Math.ceil((faucetStatus.nextClaimAt - now) / 1000));
    }
    return Math.max(0, faucetStatus.remainingSeconds);
  }, [faucetStatus, now]);

  const claimable = !faucetStatus || remainingSeconds === 0;

  const handleClaim = async () => {
    if (!connected || !address) {
      connect();
      return;
    }

    if (!claimable) {
      setError(
        `Faucet cooldown active. Try again in ${formatDuration(
          remainingSeconds,
        )}.`,
      );
      return;
    }

    setClaiming(true);
    setError("");
    setSuccess(false);
    setTxHash("");

    try {
      const result = await api.claimFaucet({
        walletAddress: address,
        amount: parseInt(amount, 10),
      });

      setTxHash(result.txHash);
      setSuccess(true);
      await refreshFaucetStatus();
    } catch (claimError) {
      if (isApiError(claimError) && claimError.code === "FAUCET_COOLDOWN") {
        await refreshFaucetStatus();
      }
      setError(getApiErrorMessage(claimError));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 via-purple-400 to-red-400 bg-clip-text text-transparent">
          $CULT Faucet
        </h1>
        <p className="text-gray-400 text-sm mt-2">
          Get test $CULT tokens to deploy agents and fund operations on Monad
          Testnet.
        </p>
      </div>

      <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-5">
        {/* Token info */}
        <div className="bg-gray-900 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Token</span>
            <span className="text-white font-semibold">
              $CULT (Mocult Token)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Network</span>
            <span className="text-white">Monad Testnet (10143)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max per claim</span>
            <span className="text-yellow-400 font-bold">1,000 $CULT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Cooldown</span>
            <span className="text-white">24 hours</span>
          </div>
          {connected && address && faucetStatus && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Claim status</span>
                <span
                  className={claimable ? "text-green-400" : "text-yellow-300"}
                >
                  {claimable
                    ? "Claimable"
                    : `Cooldown (${formatDuration(remainingSeconds)})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Next claim at</span>
                <span className="text-white text-xs">
                  {formatNextClaim(faucetStatus.nextClaimAt)}
                </span>
              </div>
            </>
          )}
          {CULT_TOKEN_ADDRESS && (
            <div className="flex justify-between">
              <span className="text-gray-400">Contract</span>
              <a
                href={`${MONAD_EXPLORER}/address/${CULT_TOKEN_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 font-mono text-xs underline"
              >
                {CULT_TOKEN_ADDRESS.slice(0, 10)}...
                {CULT_TOKEN_ADDRESS.slice(-6)}
              </a>
            </div>
          )}
        </div>

        {/* Amount selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">
            Amount to claim
          </label>
          <div className="flex gap-2">
            {["100", "500", "1000"].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  amount === v
                    ? "bg-purple-600 text-white glow-purple"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {v} CULT
              </button>
            ))}
          </div>
        </div>

        {/* Connected wallet */}
        {connected && address && (
          <div className="bg-gray-900 rounded-lg p-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Receiving wallet:</span>
            <span className="text-xs font-mono text-white">
              {address.slice(0, 8)}...{address.slice(-6)}
            </span>
          </div>
        )}

        {/* Claim button */}
        {!connected ? (
          <button
            onClick={connect}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Connect Wallet
          </button>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming || statusLoading || !claimable}
            className="w-full bg-gradient-to-r from-yellow-500 to-purple-600 hover:from-yellow-400 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold py-3 rounded-lg transition-all text-sm"
          >
            {claiming
              ? "Minting tokens..."
              : !claimable
              ? `Cooldown: ${formatDuration(remainingSeconds)}`
              : `Claim ${amount} $CULT`}
          </button>
        )}

        {/* Success */}
        {success && txHash && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
            <p className="text-green-400 font-semibold text-sm mb-1">
              {amount} $CULT sent to your wallet!
            </p>
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

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Info box */}
        <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">
            What to do with $CULT?
          </h3>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-gray-400 font-bold">•</span>
              <span>
                <strong className="text-gray-300">Deploy agents</strong> — costs
                100 CULT (30 burned, 50 treasury, 20 staking)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 font-bold">•</span>
              <span>
                <strong className="text-gray-300">Fund agent wallets</strong> —
                send extra CULT to power raids and operations
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 font-bold">•</span>
              <span>
                <strong className="text-gray-300">Stake for faith</strong> —
                earn faith points and boost your cult
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
