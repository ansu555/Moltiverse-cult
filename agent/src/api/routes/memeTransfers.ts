import { Router, Request, Response } from "express";
import { createLogger } from "../../utils/logger.js";
import { loadMemes, loadTokenTransfers } from "../../services/InsForgeService.js";
import type { AgentOrchestrator } from "../../core/AgentOrchestrator.js";

const log = createLogger("API:MemesTransfers");

/**
 * Routes for memes and token transfers between agents.
 */
export function memeTransferRoutes(orchestrator: AgentOrchestrator): Router {
  const router = Router();

  // GET /api/social/memes — List recent memes
  router.get("/memes", async (_req: Request, res: Response) => {
    try {
      const limit = parseInt((_req.query.limit as string) || "50");
      const memes = await loadMemes(limit);
      res.json(memes);
    } catch (error: any) {
      log.error(`Failed to load memes: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/social/transfers — List recent token transfers (bribes/goodwill)
  router.get("/transfers", async (_req: Request, res: Response) => {
    try {
      const limit = parseInt((_req.query.limit as string) || "50");
      const transfers = await loadTokenTransfers(limit);
      res.json(transfers);
    } catch (error: any) {
      log.error(`Failed to load transfers: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/social/bribes — Bribe offer feed/status
  router.get("/bribes", async (req: Request, res: Response) => {
    try {
      const limit = parseInt((req.query.limit as string) || "100");
      const cultIdRaw = req.query.cultId as string | undefined;
      const cultId =
        cultIdRaw !== undefined ? parseInt(cultIdRaw, 10) : undefined;
      const statusRaw = req.query.status as string | undefined;
      const status =
        statusRaw === "pending" ||
        statusRaw === "accepted" ||
        statusRaw === "rejected" ||
        statusRaw === "expired" ||
        statusRaw === "executed"
          ? statusRaw
          : undefined;

      const offers = orchestrator.groupGovernanceService.getBribeOffers({
        cultId: Number.isFinite(cultId as number) ? cultId : undefined,
        status,
        limit,
      });
      const transferRows = await loadTokenTransfers(Math.max(limit * 8, 200));
      const now = Date.now();
      const enriched = offers.map((offer: any) => {
        const createdAt = Number(offer.createdAt || offer.created_at || 0);
        const matchedTransfer = transferRows.find((row: any) => {
          if (row.from_agent_id !== offer.from_agent_id) return false;
          if (row.to_agent_id !== offer.to_agent_id) return false;
          if (!String(row.purpose || "").startsWith("bribe")) return false;
          if (String(row.amount) !== String(offer.amount)) return false;
          if (!createdAt) return true;
          return row.timestamp >= createdAt - 5 * 60 * 1000 && row.timestamp <= now + 5 * 60 * 1000;
        });
        return {
          ...offer,
          transferTxHash: matchedTransfer?.tx_hash || null,
          transferStatus: matchedTransfer
            ? matchedTransfer?.tx_hash
              ? "confirmed"
              : "failed"
            : "unknown",
        };
      });
      res.json(enriched);
    } catch (error: any) {
      log.error(`Failed to load bribes: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/social/memes/send — Trigger a meme send from one agent to another
  router.post("/memes/send", async (req: Request, res: Response) => {
    try {
      const { fromAgentId, toAgentId, memeUrl } = req.body;

      if (!fromAgentId || !toAgentId) {
        return res.status(400).json({ error: "Missing fromAgentId or toAgentId" });
      }

      const fromAgent = orchestrator.getAgentByDbId(parseInt(String(fromAgentId)));
      const toAgent = orchestrator.getAgentByDbId(parseInt(String(toAgentId)));

      if (!fromAgent || !toAgent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (toAgent.cultId < 0) {
        return res.status(400).json({ error: "Target agent is currently ungrouped" });
      }

      // Trigger via the public API method
      await fromAgent.sendMemeToTarget(toAgent.cultId, memeUrl);

      res.json({
        success: true,
        message: `Meme sent from agent ${fromAgentId} to agent ${toAgentId}`,
      });
    } catch (error: any) {
      log.error(`Meme send failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/social/transfers/send — Trigger a token transfer (bribe/goodwill)
  router.post("/transfers/send", async (req: Request, res: Response) => {
    try {
      const { fromAgentId, toAgentId, amount } = req.body;

      if (!fromAgentId || !toAgentId) {
        return res.status(400).json({ error: "Missing fromAgentId or toAgentId" });
      }

      const fromAgent = orchestrator.getAgentByDbId(parseInt(String(fromAgentId)));
      const toAgent = orchestrator.getAgentByDbId(parseInt(String(toAgentId)));

      if (!fromAgent || !toAgent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (toAgent.cultId < 0) {
        return res.status(400).json({ error: "Target agent is currently ungrouped" });
      }

      // Trigger via the public API method
      await fromAgent.sendBribeToTarget(toAgent.cultId, amount ? parseFloat(amount) : undefined);

      res.json({
        success: true,
        message: `Token transfer from agent ${fromAgentId} to agent ${toAgentId}`,
      });
    } catch (error: any) {
      log.error(`Token transfer failed: ${error.message}`);
      const statusCode = String(error?.message || "").toLowerCase().includes("insufficient")
        || String(error?.message || "").toLowerCase().includes("skipped")
        ? 400
        : 500;
      res.status(statusCode).json({ error: error.message });
    }
  });

  // GET /api/social/feed — Combined social feed (memes + transfers, chronological)
  router.get("/feed", async (_req: Request, res: Response) => {
    try {
      const limit = parseInt((_req.query.limit as string) || "30");
      const [memes, transfers] = await Promise.all([
        loadMemes(limit),
        loadTokenTransfers(limit),
      ]);

      // Merge and sort by timestamp descending
      const feed = [
        ...memes.map((m: any) => ({ ...m, feedType: "meme" })),
        ...transfers.map((t: any) => ({ ...t, feedType: "transfer" })),
      ].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
       .slice(0, limit);

      res.json(feed);
    } catch (error: any) {
      log.error(`Failed to load social feed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
