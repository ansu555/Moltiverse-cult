import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { createLogger } from "../../utils/logger.js";
import { config, CULT_TOKEN_ABI } from "../../config.js";
import {
  saveFundingEvent,
  saveWithdrawalEvent,
  saveFaucetClaim,
  getLastFaucetClaim,
} from "../../services/InsForgeService.js";
import type { AgentOrchestrator } from "../../core/AgentOrchestrator.js";

const log = createLogger("API:AgentCreation");
const FAUCET_MAX_AMOUNT = 1000;
const FAUCET_COOLDOWN_SECONDS = 24 * 60 * 60;
const FAUCET_COOLDOWN_MS = FAUCET_COOLDOWN_SECONDS * 1000;

interface FaucetStatus {
  claimable: boolean;
  maxAmount: number;
  cooldownSeconds: number;
  remainingSeconds: number;
  nextClaimAt: number | null;
}

async function computeFaucetStatus(walletAddress: string): Promise<FaucetStatus> {
  const now = Date.now();
  let lastClaimMs: number | null = null;

  // Source of truth: on-chain timestamp.
  try {
    if (config.cultTokenAddress) {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const token = new ethers.Contract(config.cultTokenAddress, CULT_TOKEN_ABI, provider);
      const lastClaim = await token.lastFaucetClaim(walletAddress);
      if (typeof lastClaim === "bigint" && lastClaim > 0n) {
        lastClaimMs = Number(lastClaim) * 1000;
      }
    }
  } catch (err: any) {
    log.warn(`On-chain faucet status read failed for ${walletAddress}: ${err.message}`);
  }

  // Fallback: DB record only when chain read is unavailable / empty.
  if (!lastClaimMs) {
    const dbClaim = await getLastFaucetClaim(walletAddress);
    if (dbClaim?.timestamp) {
      lastClaimMs = Number(dbClaim.timestamp);
    }
  }

  let remainingSeconds = 0;
  let nextClaimAt: number | null = null;

  if (lastClaimMs) {
    const elapsed = now - lastClaimMs;
    if (elapsed < FAUCET_COOLDOWN_MS) {
      remainingSeconds = Math.ceil((FAUCET_COOLDOWN_MS - elapsed) / 1000);
      nextClaimAt = lastClaimMs + FAUCET_COOLDOWN_MS;
    }
  }

  return {
    claimable: remainingSeconds === 0,
    maxAmount: FAUCET_MAX_AMOUNT,
    cooldownSeconds: FAUCET_COOLDOWN_SECONDS,
    remainingSeconds,
    nextClaimAt,
  };
}

/**
 * POST /api/agents/create — Create a new agent with:
 *   - Custom system prompt (the user uploads their prompt)
 *   - Optional per-agent LLM API key
 *   - Auto-generated unique wallet
 *
 * Body:
 * {
 *   "name": "My Cult of Degen Lords",
 *   "symbol": "DEGEN",
 *   "style": "aggressive",
 *   "systemPrompt": "You are a ruthless degen overlord...",
 *   "description": "A cult for the boldest degens",
 *   "llmApiKey": "xai-...",          // optional — uses default if omitted
 *   "llmBaseUrl": "https://...",       // optional
 *   "llmModel": "openrouter/aurora-alpha",        // optional
 *   "walletPrivateKey": "0x...",       // optional — generates new if omitted
 *   "ownerId": "user123"              // optional — for multi-user support
 * }
 */
export function agentCreationRoutes(orchestrator: AgentOrchestrator): Router {
  const router = Router();

  // POST /api/agents/create — Create a new agent
  router.post("/create", async (req: Request, res: Response) => {
    try {
      const {
        name,
        symbol,
        style,
        systemPrompt,
        description,
        llmApiKey,
        llmBaseUrl,
        llmModel,
        walletPrivateKey,
        ownerId,
      } = req.body;

      if (!name || !systemPrompt) {
        return res.status(400).json({
          error: "Missing required fields: name, systemPrompt",
        });
      }

      if (typeof systemPrompt !== "string" || systemPrompt.length < 20) {
        return res.status(400).json({
          error: "systemPrompt must be at least 20 characters",
        });
      }

      if (systemPrompt.length > 5000) {
        return res.status(400).json({
          error: "systemPrompt must be under 5000 characters",
        });
      }

      if (walletPrivateKey !== undefined) {
        if (typeof walletPrivateKey !== "string") {
          return res.status(400).json({
            code: "INVALID_WALLET_PRIVATE_KEY",
            error: "walletPrivateKey must be a string",
          });
        }

        try {
          new ethers.Wallet(walletPrivateKey);
        } catch {
          return res.status(400).json({
            code: "INVALID_WALLET_PRIVATE_KEY",
            error: "Invalid walletPrivateKey format",
          });
        }
      }

      log.info(`Creating agent: ${name} (owner: ${ownerId || "anonymous"})`);

      const { agent, row } = await orchestrator.createNewAgent({
        name,
        symbol,
        style,
        system_prompt: systemPrompt,
        description,
        llm_api_key: llmApiKey,
        llm_base_url: llmBaseUrl,
        llm_model: llmModel,
        wallet_private_key: walletPrivateKey,
        owner_id: ownerId,
      });

      res.status(201).json({
        success: true,
        agent: {
          id: row.id,
          cultId: row.cult_id,
          name: row.name,
          symbol: row.symbol,
          style: row.style,
          walletAddress: row.wallet_address,
          status: row.status,
          createdAt: row.created_at,
          // Never expose private key or LLM API key in response
        },
      });
    } catch (error: any) {
      log.error(`Agent creation failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agents/list — List all agents (with wallet addresses, no secrets)
  router.get("/list", (_req: Request, res: Response) => {
    try {
      const rows = orchestrator.getAllAgentRows();
      res.json(
        rows.map((row) => ({
          id: row.id,
          cultId: row.cult_id,
          name: row.name,
          symbol: row.symbol,
          style: row.style,
          walletAddress: row.wallet_address,
          status: row.status,
          dead: row.dead,
          cycleCount: row.cycle_count,
          propheciesGenerated: row.prophecies_generated,
          raidsInitiated: row.raids_initiated,
          raidsWon: row.raids_won,
          followersRecruited: row.followers_recruited,
          lastAction: row.last_action,
          hasCustomLlmKey: !!row.llm_api_key,
          createdAt: row.created_at,
        })),
      );
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agents/management/apply-personalities
  // Reload canonical personality.json and apply to DB rows + live agent instances.
  router.post("/apply-personalities", async (_req: Request, res: Response) => {
    try {
      const result = await orchestrator.applyPersonalitiesFromCanonical();
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to apply personalities",
      });
    }
  });

  // GET /api/agents/:id/wallet — Get agent wallet info (address only, not private key)
  router.get("/:id/wallet", (req: Request, res: Response) => {
    try {
      const row = orchestrator.getAgentRow(parseInt(String(req.params.id)));
      if (!row) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json({
        agentId: row.id,
        name: row.name,
        walletAddress: row.wallet_address,
        // Never expose private key in API
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agents/:id/stop — Stop an agent
  router.post("/:id/stop", (req: Request, res: Response) => {
    try {
      const agent = orchestrator.getAgentByDbId(parseInt(String(req.params.id)));
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      agent.stop();
      res.json({ success: true, message: `Agent ${req.params.id} stopped` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agents/:id/start — Resume an agent
  router.post("/:id/start", (req: Request, res: Response) => {
    try {
      const agent = orchestrator.getAgentByDbId(parseInt(String(req.params.id)));
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      agent.start().catch(() => {});
      res.json({ success: true, message: `Agent ${req.params.id} started` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Personality Upload ──────────────────────────────────────────────
  // POST /api/agents/management/upload-personality
  // Accepts JSON body with personality fields, validates schema, returns parsed object.
  router.post("/upload-personality", (req: Request, res: Response) => {
    try {
      const { name, symbol, style, systemPrompt, description } = req.body;

      const errors: string[] = [];
      if (!name || typeof name !== "string") errors.push("name is required (string)");
      if (!systemPrompt || typeof systemPrompt !== "string") errors.push("systemPrompt is required (string)");
      if (systemPrompt && systemPrompt.length < 20) errors.push("systemPrompt must be at least 20 characters");
      if (systemPrompt && systemPrompt.length > 5000) errors.push("systemPrompt must be under 5000 characters");

      if (errors.length > 0) {
        return res.status(400).json({ error: "Invalid personality file", details: errors });
      }

      const parsed = {
        name: name.trim(),
        symbol: (symbol || "CULT").trim().toUpperCase(),
        style: (style || "custom").trim(),
        systemPrompt: systemPrompt.trim(),
        description: (description || "").trim(),
      };

      res.json({ success: true, personality: parsed });
    } catch (error: any) {
      res.status(400).json({ error: "Invalid JSON: " + error.message });
    }
  });

  // ── Fund Agent ──────────────────────────────────────────────────────
  // POST /api/agents/management/:id/fund
  // Records a funding event (the actual $CULT transfer happens on-chain via frontend).
  router.post("/:id/fund", async (req: Request, res: Response) => {
    try {
      const agentId = parseInt(String(req.params.id));
      const { funderAddress, amount, txHash } = req.body;

      if (!funderAddress || !amount || !txHash) {
        return res.status(400).json({ error: "Missing funderAddress, amount, or txHash" });
      }

      const row = orchestrator.getAgentRow(agentId);
      if (!row) {
        return res.status(404).json({ error: "Agent not found" });
      }

      await saveFundingEvent({
        agent_id: agentId,
        funder_address: funderAddress.toLowerCase(),
        amount: String(amount),
        tx_hash: txHash,
        timestamp: Date.now(),
      });

      log.info(`Funding recorded: agent ${agentId}, ${amount} CULT from ${funderAddress}`);
      res.json({ success: true, agentId, walletAddress: row.wallet_address });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Agent Balance ───────────────────────────────────────────────────
  // GET /api/agents/management/:id/balance
  // Returns the agent's $CULT balance by reading on-chain.
  router.get("/:id/balance", async (req: Request, res: Response) => {
    try {
      const agentId = parseInt(String(req.params.id));
      const row = orchestrator.getAgentRow(agentId);
      if (!row) {
        return res.status(404).json({ error: "Agent not found" });
      }

      let cultBalance = "0";
      let monBalance = "0";

      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        monBalance = ethers.formatEther(await provider.getBalance(row.wallet_address));

        if (config.cultTokenAddress) {
          const token = new ethers.Contract(config.cultTokenAddress, CULT_TOKEN_ABI, provider);
          const bal = await token.balanceOf(row.wallet_address);
          cultBalance = ethers.formatEther(bal);
        }
      } catch (err: any) {
        log.warn(`Failed to fetch balance for agent ${agentId}: ${err.message}`);
      }

      res.json({
        agentId,
        walletAddress: row.wallet_address,
        cultBalance,
        monBalance,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Withdraw ────────────────────────────────────────────────────────
  // POST /api/agents/management/:id/withdraw
  // Verifies ownership, then transfers $CULT from agent wallet back to owner.
  router.post("/:id/withdraw", async (req: Request, res: Response) => {
    try {
      const agentId = parseInt(String(req.params.id));
      const { ownerAddress, amount } = req.body;

      if (!ownerAddress || !amount) {
        return res.status(400).json({ error: "Missing ownerAddress or amount" });
      }

      const row = orchestrator.getAgentRow(agentId);
      if (!row) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Ownership check: owner_id must match the requesting wallet
      if (!row.owner_id || row.owner_id.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: "Not the owner of this agent" });
      }

      if (!config.cultTokenAddress) {
        return res.status(400).json({ error: "$CULT token not configured" });
      }

      // Use the agent's private key to send $CULT back to the owner
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const agentWallet = new ethers.Wallet(row.wallet_private_key, provider);
      const token = new ethers.Contract(config.cultTokenAddress, CULT_TOKEN_ABI, agentWallet);

      const amountWei = ethers.parseEther(String(amount));
      const balance = await token.balanceOf(row.wallet_address);

      if (balance < amountWei) {
        return res.status(400).json({
          error: "Insufficient CULT balance",
          available: ethers.formatEther(balance),
          requested: amount,
        });
      }

      const tx = await token.transfer(ownerAddress, amountWei);
      const receipt = await tx.wait();

      await saveWithdrawalEvent({
        agent_id: agentId,
        owner_address: ownerAddress.toLowerCase(),
        amount: String(amount),
        tx_hash: receipt.hash,
        timestamp: Date.now(),
      });

      log.info(`Withdrawal: ${amount} CULT from agent ${agentId} → ${ownerAddress} (tx: ${receipt.hash})`);

      res.json({
        success: true,
        txHash: receipt.hash,
        amount,
        from: row.wallet_address,
        to: ownerAddress,
      });
    } catch (error: any) {
      log.error(`Withdrawal failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Faucet ──────────────────────────────────────────────────────────
  // GET /api/agents/management/faucet-status/:walletAddress
  // Returns claimability and cooldown metadata for a wallet.
  router.get("/faucet-status/:walletAddress", async (req: Request, res: Response) => {
    try {
      const walletAddress = String(req.params.walletAddress || "");
      if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({
          code: "INVALID_WALLET_ADDRESS",
          error: "Invalid walletAddress",
        });
      }

      if (!config.cultTokenAddress) {
        return res.status(400).json({
          code: "TOKEN_NOT_CONFIGURED",
          error: "$CULT token not configured",
        });
      }

      const status = await computeFaucetStatus(walletAddress);
      res.json(status);
    } catch (error: any) {
      log.error(`Faucet status failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agents/management/faucet
  // Owner-gated on-chain faucet call. Rate-limited: 1000 CULT / 24h per address.
  router.post("/faucet", async (req: Request, res: Response) => {
    try {
      const { walletAddress, amount } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: "Missing walletAddress" });
      }

      if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({
          code: "INVALID_WALLET_ADDRESS",
          error: "Invalid walletAddress",
        });
      }

      if (!config.cultTokenAddress) {
        return res.status(400).json({
          code: "TOKEN_NOT_CONFIGURED",
          error: "$CULT token not configured",
        });
      }

      const requestedAmount = Number(amount ?? FAUCET_MAX_AMOUNT);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > FAUCET_MAX_AMOUNT) {
        return res.status(400).json({
          code: "INVALID_AMOUNT",
          error: `Amount must be 0 < amount <= ${FAUCET_MAX_AMOUNT}`,
          maxAmount: FAUCET_MAX_AMOUNT,
        });
      }

      const status = await computeFaucetStatus(walletAddress);
      if (!status.claimable) {
        return res.status(429).json({
          code: "FAUCET_COOLDOWN",
          error: "Faucet cooldown active",
          ...status,
        });
      }

      // Call on-chain faucet using the deployer (owner) key
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const ownerWallet = new ethers.Wallet(config.privateKey, provider);
      const token = new ethers.Contract(config.cultTokenAddress, CULT_TOKEN_ABI, ownerWallet);

      const amountWei = ethers.parseEther(String(requestedAmount));
      let tx;
      try {
        tx = await token.faucet(walletAddress, amountWei);
      } catch (chainError: any) {
        const message = String(chainError?.reason || chainError?.message || "");
        if (message.includes("CULTToken: faucet cooldown active")) {
          const latestStatus = await computeFaucetStatus(walletAddress);
          return res.status(429).json({
            code: "FAUCET_COOLDOWN",
            error: "Faucet cooldown active",
            ...latestStatus,
          });
        }
        throw chainError;
      }
      const receipt = await tx.wait();

      await saveFaucetClaim({
        wallet_address: walletAddress.toLowerCase(),
        amount: String(requestedAmount),
        tx_hash: receipt.hash,
        timestamp: Date.now(),
      });

      log.info(`Faucet: ${requestedAmount} CULT → ${walletAddress} (tx: ${receipt.hash})`);

      res.json({
        success: true,
        txHash: receipt.hash,
        amount: requestedAmount,
        to: walletAddress,
      });
    } catch (error: any) {
      log.error(`Faucet failed: ${error.message}`);
      res.status(500).json({
        code: "FAUCET_FAILED",
        error: error.message,
      });
    }
  });

  return router;
}
