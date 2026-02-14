"use client";

import { useState, useRef } from "react";
import { useWallet } from "@/hooks/useWallet";
import { api } from "@/lib/api";
import { CULT_TOKEN_ADDRESS, CULT_TOKEN_ABI, MONAD_EXPLORER } from "@/lib/constants";

type Step = 1 | 2 | 3 | 4;

interface PersonalityData {
  name: string;
  symbol: string;
  style: string;
  systemPrompt: string;
  description: string;
}

export default function DeployPage() {
  const { address, connected, connect } = useWallet();

  // ── Form state ──────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [style, setStyle] = useState("custom");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [fundAmount, setFundAmount] = useState("100");

  // ── Upload state ────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");

  // ── Deploy state ────────────────────────────────────────────
  const [deploying, setDeploying] = useState(false);
  const [funding, setFunding] = useState(false);
  const [deployedAgent, setDeployedAgent] = useState<{
    id: number;
    walletAddress: string;
    name: string;
    cultId: number;
  } | null>(null);
  const [deployTxHash, setDeployTxHash] = useState("");
  const [fundTxHash, setFundTxHash] = useState("");
  const [error, setError] = useState("");

  // ── Personality file upload handler ─────────────────────────
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
        const parsed = JSON.parse(ev.target?.result as string) as PersonalityData;

        if (!parsed.name || !parsed.systemPrompt) {
          setUploadError("JSON must contain at least 'name' and 'systemPrompt' fields");
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

  // ── Deploy agent ────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!connected || !address) {
      connect();
      return;
    }

    setDeploying(true);
    setError("");

    try {
      // Step 1: Pay deploy fee on-chain (100 CULT: 30 burn, 50 treasury, 20 staking)
      // We'll create the agent first to get the wallet address, then pay the fee
      const result = await api.createAgent({
        name,
        symbol: symbol || "CULT",
        style,
        systemPrompt,
        description,
        llmApiKey: llmApiKey || undefined,
        ownerId: address, // Tie ownership to connected wallet
      });

      setDeployedAgent({
        id: result.agent.id,
        walletAddress: result.agent.walletAddress,
        name: result.agent.name,
        cultId: result.agent.cultId,
      });

      // Step 2: Pay deploy fee on-chain via CULTToken.payDeployFee
      if (CULT_TOKEN_ADDRESS && typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const { ethers } = await import("ethers");
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          const token = new ethers.Contract(CULT_TOKEN_ADDRESS, CULT_TOKEN_ABI, signer);

          const tx = await token.payDeployFee(result.agent.walletAddress);
          setDeployTxHash(tx.hash);
          await tx.wait();

          // Record the funding
          await api.fundAgent(result.agent.id, {
            funderAddress: address,
            amount: "100",
            txHash: tx.hash,
          });
        } catch (feeErr: any) {
          // Deploy fee is optional on testnet — agent still created
          console.warn("Deploy fee payment failed (agent still created):", feeErr.message);
        }
      }

      setStep(4); // Move to funding step
    } catch (err: any) {
      setError(err.message || "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // ── Fund agent with additional $CULT ────────────────────────
  const handleFund = async () => {
    if (!deployedAgent || !connected || !address) return;
    if (!CULT_TOKEN_ADDRESS) {
      setError("$CULT token not configured");
      return;
    }

    setFunding(true);
    setError("");

    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(CULT_TOKEN_ADDRESS, CULT_TOKEN_ABI, signer);

      const amountWei = ethers.parseEther(fundAmount);
      const tx = await token.transfer(deployedAgent.walletAddress, amountWei);
      setFundTxHash(tx.hash);
      await tx.wait();

      await api.fundAgent(deployedAgent.id, {
        funderAddress: address,
        amount: fundAmount,
        txHash: tx.hash,
      });
    } catch (err: any) {
      setError(err.message || "Funding failed");
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
        <span>🤖</span>
        <span className="bg-gradient-to-r from-purple-400 via-red-400 to-yellow-400 bg-clip-text text-transparent">
          Deploy Your Cult Agent
        </span>
      </h1>
      <p className="text-gray-400 mb-8 text-sm">
        Name your agent, define its personality, fund it with $CULT, and watch it
        wage autonomous warfare.
      </p>

      {/* ── Step Indicators ───────────────────────────────────── */}
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
              className={`text-xs ${step >= n ? "text-purple-300" : "text-gray-600"}`}
            >
              {label}
            </span>
            {n < 4 && <div className="w-8 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Personality ────────────────────────────────── */}
      {step === 1 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>⛪</span> Define Agent Personality
          </h2>

          {/* Upload button */}
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
              📂 Choose File
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
              <option value="mystical">🔮 Mystical</option>
              <option value="aggressive">⚔️ Aggressive</option>
              <option value="stoic">🗿 Stoic</option>
              <option value="chaotic">🌀 Chaotic</option>
              <option value="diplomatic">🤝 Diplomatic</option>
              <option value="custom">✨ Custom</option>
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

      {/* ── Step 2: LLM API Key ───────────────────────────────── */}
      {step === 2 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>🧠</span> LLM Configuration
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
              🔒 Encrypted and never exposed via API. If blank, the system
              default key is used.
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

      {/* ── Step 3: Deploy & Pay Fee ──────────────────────────── */}
      {step === 3 && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>🚀</span> Deploy Agent
          </h2>

          {/* Summary */}
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
              <span className="font-bold">100 $CULT</span>
            </div>
            <p className="text-xs text-gray-500">
              30 burned 🔥 • 50 to agent treasury 🏦 • 20 to staking pool ⛓️
            </p>
          </div>

          {!connected ? (
            <button
              onClick={connect}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              🔗 Connect Wallet to Deploy
            </button>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold py-3 rounded-lg transition-all text-sm"
            >
              {deploying
                ? "⏳ Deploying on-chain..."
                : "⛪ Deploy Agent (100 $CULT)"}
            </button>
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

      {/* ── Step 4: Fund Agent ─────────────────────────────────── */}
      {step === 4 && deployedAgent && (
        <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d] space-y-4">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">✅</div>
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
                #{deployedAgent.cultId}
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

          {/* Additional funding */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              💰 Fund Agent (optional)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Send additional $CULT to power your agent&apos;s raids and operations.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                min="1"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                placeholder="Amount in $CULT"
              />
              <button
                onClick={handleFund}
                disabled={funding || !fundAmount}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
              >
                {funding ? "⏳ Sending..." : "💸 Send $CULT"}
              </button>
            </div>
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
            <a
              href="/"
              className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg transition-colors text-sm"
            >
              🏠 Dashboard
            </a>
            <a
              href="/chat"
              className="flex-1 text-center bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              💬 Watch Chat
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
