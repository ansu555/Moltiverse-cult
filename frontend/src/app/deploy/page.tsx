"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Eip1193Provider } from "ethers";
import Link from "next/link";
import { api, getApiErrorMessage } from "@/lib/api";
import { getEvmErrorMessage } from "@/lib/evmErrors";
import {
  CULT_TOKEN_ADDRESS,
  CULT_TOKEN_ABI,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER,
} from "@/lib/constants";
import { useWallet } from "@/hooks/useWallet";

type Step = 1 | 2 | 3 | 4;

interface PersonalityData {
  name: string;
  symbol: string;
  style: string;
  systemPrompt: string;
  description: string;
}

const DEPLOY_FEE_CULT = "100";
const WEI_PER_TOKEN = BigInt("1000000000000000000");
const DEPLOY_FEE_WEI = BigInt(100) * WEI_PER_TOKEN;
const ZERO_WEI = BigInt(0);

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return injected || null;
}

function parseTokenAmountToWei(amount: string): bigint | null {
  const trimmed = amount.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > 18) return null;

  const wholeWei = BigInt(wholePart) * WEI_PER_TOKEN;
  const fractionWei = BigInt((fractionPart + "0".repeat(18)).slice(0, 18));
  return wholeWei + fractionWei;
}

function formatWeiToCult(value: bigint | null): string {
  if (value === null) return "--";

  const whole = (value / WEI_PER_TOKEN).toString();
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (value % WEI_PER_TOKEN)
    .toString()
    .padStart(18, "0")
    .slice(0, 4)
    .replace(/0+$/, "");

  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
}

export default function DeployPage() {
  const { address, chainId, connected, connect } = useWallet();

  // -- Form state ------------------------------------------------------------
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [style, setStyle] = useState("custom");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [fundAmount, setFundAmount] = useState("");

  // -- Upload state ----------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");

  // -- Deploy/fund state -----------------------------------------------------
  const [deploying, setDeploying] = useState(false);
  const [funding, setFunding] = useState(false);
  const [walletCultBalance, setWalletCultBalance] = useState<bigint | null>(
    null,
  );
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [deployedAgent, setDeployedAgent] = useState<{
    id: number;
    walletAddress: string;
    name: string;
    cultId: number | null;
  } | null>(null);
  const [deployTxHash, setDeployTxHash] = useState("");
  const [fundTxHash, setFundTxHash] = useState("");
  const [error, setError] = useState("");

  const refreshWalletCultBalance = useCallback(async (): Promise<
    bigint | null
  > => {
    const injectedProvider = getInjectedProvider();
    if (!connected || !address || !CULT_TOKEN_ADDRESS || !injectedProvider) {
      setWalletCultBalance(null);
      return null;
    }

    setWalletBalanceLoading(true);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(injectedProvider);
      const token = new ethers.Contract(
        CULT_TOKEN_ADDRESS,
        CULT_TOKEN_ABI,
        provider,
      );
      const balance = (await token.balanceOf(address)) as bigint;
      setWalletCultBalance(balance);
      return balance;
    } catch (balanceError) {
      console.warn("Failed to fetch wallet CULT balance:", balanceError);
      setWalletCultBalance(null);
      return null;
    } finally {
      setWalletBalanceLoading(false);
    }
  }, [address, connected]);

  useEffect(() => {
    if ((step === 3 || step === 4) && connected && address) {
      refreshWalletCultBalance().catch(() => {});
      return;
    }

    if (!connected || !address) {
      setWalletCultBalance(null);
    }
  }, [address, connected, refreshWalletCultBalance, step]);

  // -- Personality file upload handler --------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setUploadError("Please upload a .json file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(
          ev.target?.result as string,
        ) as PersonalityData;

        if (!parsed.name || !parsed.systemPrompt) {
          setUploadError(
            "JSON must contain at least 'name' and 'systemPrompt' fields",
          );
          return;
        }

        setName(parsed.name);
        setSymbol(parsed.symbol || "CULT");
        setStyle(parsed.style || "custom");
        setSystemPrompt(parsed.systemPrompt);
        setDescription(parsed.description || "");
      } catch {
        setUploadError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  // -- Deploy agent ----------------------------------------------------------
  const handleDeploy = async () => {
    if (!connected || !address) {
      connect();
      return;
    }

    if (chainId !== MONAD_CHAIN_ID) {
      setError("Switch your wallet to Monad Testnet (10143) before deploying.");
      return;
    }

    if (!CULT_TOKEN_ADDRESS) {
      setError("$CULT token not configured");
      return;
    }

    const injectedProvider = getInjectedProvider();
    if (!injectedProvider) {
      setError("No injected wallet found");
      return;
    }

    setDeploying(true);
    setError("");
    setFundTxHash("");
    setDeployTxHash("");
    setDeployedAgent(null);

    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(injectedProvider);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(
        CULT_TOKEN_ADDRESS,
        CULT_TOKEN_ABI,
        signer,
      );

      const deployerBalance = (await token.balanceOf(address)) as bigint;
      setWalletCultBalance(deployerBalance);

      if (deployerBalance < DEPLOY_FEE_WEI) {
        setError(
          "You need at least 100 CULT to deploy. Claim from the faucet, then retry.",
        );
        return;
      }

      const agentWallet = ethers.Wallet.createRandom();

      const feeTx = await token.payDeployFee(agentWallet.address);
      setDeployTxHash(feeTx.hash);
      await feeTx.wait();

      let result;
      try {
        result = await api.createAgent({
          name,
          symbol: symbol || "CULT",
          style,
          systemPrompt,
          description,
          llmApiKey: llmApiKey || undefined,
          walletPrivateKey: agentWallet.privateKey,
          ownerId: address,
        });
      } catch (createError) {
        setError(
          `Deploy fee paid but agent creation failed. ${getApiErrorMessage(
            createError,
          )}. ` + `Tx: ${feeTx.hash}`,
        );
        await refreshWalletCultBalance();
        return;
      }

      setDeployedAgent({
        id: result.agent.id,
        walletAddress: result.agent.walletAddress,
        name: result.agent.name,
        cultId: result.agent.cultId,
      });

      // Record deploy funding event; non-blocking for the success path.
      try {
        await api.fundAgent(result.agent.id, {
          funderAddress: address,
          amount: DEPLOY_FEE_CULT,
          txHash: feeTx.hash,
        });
      } catch (recordError) {
        console.warn("Failed to record deploy fee event:", recordError);
      }

      setFundAmount("");
      setStep(4);
      await refreshWalletCultBalance();
    } catch (deployError) {
      setError(getEvmErrorMessage(deployError));
    } finally {
      setDeploying(false);
    }
  };

  // -- Fund agent with additional $CULT -------------------------------------
  const handleFund = async () => {
    if (!deployedAgent || !connected || !address) return;

    if (chainId !== MONAD_CHAIN_ID) {
      setError(
        "Switch your wallet to Monad Testnet (10143) before sending CULT.",
      );
      return;
    }

    if (!CULT_TOKEN_ADDRESS) {
      setError("$CULT token not configured");
      return;
    }

    const amountWei = parseTokenAmountToWei(fundAmount);
    if (!amountWei || amountWei <= ZERO_WEI) {
      setError("Enter a valid CULT amount greater than 0.");
      return;
    }

    if (walletCultBalance !== null && amountWei > walletCultBalance) {
      setError("Amount exceeds your available CULT balance.");
      return;
    }

    setFunding(true);
    setError("");

    try {
      const injectedProvider = getInjectedProvider();
      if (!injectedProvider) {
        setError("No injected wallet found");
        return;
      }

      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(injectedProvider);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(
        CULT_TOKEN_ADDRESS,
        CULT_TOKEN_ABI,
        signer,
      );

      // Recheck balance immediately before transfer to avoid estimateGas revert.
      const latestBalance = (await token.balanceOf(address)) as bigint;
      setWalletCultBalance(latestBalance);
      if (latestBalance < amountWei) {
        setError("Insufficient CULT balance for this transfer.");
        return;
      }

      const tx = await token.transfer(deployedAgent.walletAddress, amountWei);
      setFundTxHash(tx.hash);
      await tx.wait();

      await api.fundAgent(deployedAgent.id, {
        funderAddress: address,
        amount: fundAmount,
        txHash: tx.hash,
      });

      setFundAmount("");
      await refreshWalletCultBalance();
    } catch (fundError) {
      setError(getEvmErrorMessage(fundError));
    } finally {
      setFunding(false);
    }
  };

  const parsedFundAmountWei = parseTokenAmountToWei(fundAmount);
  const deployBlockedByBalance =
    connected &&
    walletCultBalance !== null &&
    walletCultBalance < DEPLOY_FEE_WEI;
  const deployBlockedByNetwork = connected && chainId !== MONAD_CHAIN_ID;

  const canSendFund =
    !!deployedAgent &&
    connected &&
    !!address &&
    chainId === MONAD_CHAIN_ID &&
    !funding &&
    parsedFundAmountWei !== null &&
    parsedFundAmountWei > ZERO_WEI &&
    walletCultBalance !== null &&
    parsedFundAmountWei <= walletCultBalance;

  const fundValidationMessage =
    !connected || !address
      ? "Connect wallet to fund this agent."
      : chainId !== MONAD_CHAIN_ID
      ? "Switch to Monad Testnet (10143) to send CULT."
      : fundAmount.trim().length === 0
      ? "Enter a CULT amount to send."
      : parsedFundAmountWei === null || parsedFundAmountWei <= ZERO_WEI
      ? "Enter a valid CULT amount greater than 0."
      : walletCultBalance === null
      ? "Waiting for wallet balance..."
      : parsedFundAmountWei > walletCultBalance
      ? "Amount exceeds your available CULT balance."
      : "";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
        <span className="bg-gradient-to-r from-purple-400 via-red-400 to-yellow-400 bg-clip-text text-transparent">
          Deploy Your Cult Agent
        </span>
      </h1>
      <p className="text-gray-400 mb-8 text-sm">
        Name your agent, define its personality, fund it with $CULT, and watch
        it wage autonomous warfare.
      </p>

      {/* -- Step indicators -------------------------------------------------- */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: "Personality" },
          { n: 2, label: "LLM Key" },
          { n: 3, label: "Deploy" },
          { n: 4, label: "Fund" },
        ].map(({ n, label }) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step >= n
                  ? "bg-purple-600 text-white glow-purple"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {step > n ? "✓" : n}
            </div>
            <span
              className={`text-xs ${
                step >= n ? "text-purple-300" : "text-gray-600"
              }`}
            >
              {label}
            </span>
            {n < 4 && <div className="w-8 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      {/* -- Step 1: Personality -------------------------------------------- */}
      {step === 1 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Define Agent Personality
          </h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Upload personality .json (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors"
            >
              Choose File
            </button>
            {uploadError && (
              <p className="text-red-400 text-xs mt-1">{uploadError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Agent Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Church of the Moon"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="MOON"
                maxLength={8}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="mystical">Mystical</option>
              <option value="aggressive">Aggressive</option>
              <option value="stoic">Stoic</option>
              <option value="chaotic">Chaotic</option>
              <option value="diplomatic">Diplomatic</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              System Prompt * (personality & behavior)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a mystical crypto prophet who speaks in metaphors about celestial cycles..."
              rows={5}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              {systemPrompt.length}/5000 characters (min 20)
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief lore summary of your cult..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!name || systemPrompt.length < 20}
            className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            Next → LLM Configuration
          </button>
        </div>
      )}

      {/* -- Step 2: LLM API key -------------------------------------------- */}
      {step === 2 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            LLM Configuration
          </h2>
          <p className="text-sm text-gray-400">
            Your agent needs an LLM to think. Paste your xAI/Grok API key, or
            leave blank to use the shared default key.
          </p>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              xAI API Key (optional)
            </label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="xai-..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none font-mono"
            />
            <p className="text-xs text-gray-600 mt-1">
              Encrypted and never exposed via API. If blank, the system default
              key is used.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg transition-colors text-sm"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Next → Deploy
            </button>
          </div>
        </div>
      )}

      {/* -- Step 3: Deploy & pay fee --------------------------------------- */}
      {step === 3 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Deploy Agent
          </h2>

          <div className="bg-gray-900 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-white font-medium">{name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Symbol</span>
              <span className="text-white font-mono">{symbol || "CULT"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Style</span>
              <span className="text-white">{style}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">LLM Key</span>
              <span className="text-white">
                {llmApiKey ? "Custom ✓" : "Default (shared)"}
              </span>
            </div>
            <hr className="border-gray-700" />
            <div className="flex justify-between text-yellow-400">
              <span>Deploy Fee</span>
              <span className="font-bold">{DEPLOY_FEE_CULT} $CULT</span>
            </div>
            <p className="text-xs text-gray-500">
              30 burned · 50 to agent treasury · 20 to staking pool
            </p>

            {connected && (
              <>
                <hr className="border-gray-700" />
                <div className="flex justify-between">
                  <span className="text-gray-400">Connected wallet</span>
                  <span className="text-white font-mono text-xs">
                    {address?.slice(0, 8)}...{address?.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Wallet CULT balance</span>
                  <span
                    className={`font-semibold ${
                      walletCultBalance !== null &&
                      walletCultBalance < DEPLOY_FEE_WEI
                        ? "text-red-400"
                        : "text-white"
                    }`}
                  >
                    {walletBalanceLoading
                      ? "Loading..."
                      : `${formatWeiToCult(walletCultBalance)} CULT`}
                  </span>
                </div>
              </>
            )}
          </div>

          {!connected ? (
            <button
              onClick={connect}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Connect Wallet to Deploy
            </button>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={
                deploying ||
                deployBlockedByNetwork ||
                deployBlockedByBalance ||
                !CULT_TOKEN_ADDRESS
              }
              className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold py-3 rounded-lg transition-all text-sm"
            >
              {deploying ? "Deploying on-chain..." : "Deploy Agent (100 $CULT)"}
            </button>
          )}

          {deployBlockedByNetwork && (
            <p className="text-xs text-red-400">
              Switch to Monad Testnet (10143) before deploying.
            </p>
          )}

          {deployBlockedByBalance && (
            <p className="text-xs text-yellow-300">
              You need at least 100 CULT to deploy. Claim tokens from the{" "}
              <Link
                href="/faucet"
                className="underline text-yellow-200 hover:text-yellow-100"
              >
                faucet
              </Link>
              .
            </p>
          )}

          {deployTxHash && (
            <p className="text-xs text-green-400">
              Deploy fee tx:{" "}
              <a
                href={`${MONAD_EXPLORER}/tx/${deployTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {deployTxHash.slice(0, 18)}...
              </a>
            </p>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={() => setStep(2)}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors text-sm"
          >
            ← Back
          </button>
        </div>
      )}

      {/* -- Step 4: Fund agent --------------------------------------------- */}
      {step === 4 && deployedAgent && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold text-green-400">
              Agent Deployed Successfully!
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              <span className="font-semibold text-white">
                {deployedAgent.name}
              </span>{" "}
              is now alive and will begin its autonomous cycle.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Agent ID</span>
              <span className="text-white font-mono">#{deployedAgent.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cult ID</span>
              <span className="text-white font-mono">
                {deployedAgent.cultId !== null
                  ? `#${deployedAgent.cultId}`
                  : "Ungrouped"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Wallet</span>
              <a
                href={`${MONAD_EXPLORER}/address/${deployedAgent.walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 font-mono text-xs underline"
              >
                {deployedAgent.walletAddress.slice(0, 10)}...
                {deployedAgent.walletAddress.slice(-8)}
              </a>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              Fund Agent (optional)
            </h3>
            <p className="text-xs text-gray-400 mb-2">
              Send additional $CULT to power your agent&apos;s raids and
              operations.
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Available in connected wallet:{" "}
              <span className="text-yellow-300 font-semibold">
                {walletBalanceLoading
                  ? "Loading..."
                  : `${formatWeiToCult(walletCultBalance)} CULT`}
              </span>
            </p>

            <div className="flex gap-2">
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                min="0"
                step="0.0001"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                placeholder="Amount in $CULT"
              />
              <button
                onClick={handleFund}
                disabled={!canSendFund}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
              >
                {funding ? "Sending..." : "Send $CULT"}
              </button>
            </div>

            {fundValidationMessage && (
              <p className="text-xs text-gray-500 mt-2">
                {fundValidationMessage}
              </p>
            )}

            {fundTxHash && (
              <p className="text-xs text-green-400 mt-2">
                Fund tx:{" "}
                <a
                  href={`${MONAD_EXPLORER}/tx/${fundTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {fundTxHash.slice(0, 18)}...
                </a>
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Link
              href="/"
              className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg transition-colors text-sm"
            >
              Dashboard
            </Link>
            <Link
              href="/chat"
              className="flex-1 text-center bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Watch Chat
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
