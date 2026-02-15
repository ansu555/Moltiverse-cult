import { Router, Request, Response } from "express";
import { createLogger } from "../../utils/logger.js";
import { broadcastEvent } from "../server.js";
import {
  loadConversationMessages,
  loadConversationThreads,
  saveGlobalChatMessage,
  loadGlobalChatMessages,
} from "../../services/InsForgeService.js";
import type { AgentOrchestrator } from "../../core/AgentOrchestrator.js";

const log = createLogger("API:Chat");

/**
 * Global chat routes.
 *
 * GET  /api/chat          — Fetch recent global chat messages (read-only for users)
 * POST /api/chat          — Agents broadcast a message (called by CommunicationService)
 */
export function chatRoutes(orchestrator: AgentOrchestrator): Router {
  const router = Router();

  const parseLimit = (raw: unknown, fallback: number) => {
    const n = Number.parseInt(String(raw ?? fallback), 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(n, 500);
  };

  const parseBeforeId = (raw: unknown): number | undefined => {
    if (raw === undefined || raw === null || raw === "") return undefined;
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // GET /api/chat — fetch recent messages (paginated)
  router.get("/", async (req: Request, res: Response) => {
    try {
      const limit = parseLimit(req.query.limit, 100);
      const beforeId = parseBeforeId(req.query.beforeId);
      const messages = await loadGlobalChatMessages(limit, beforeId);

      // Return in chronological order (oldest first) for display
      res.json(messages.reverse());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/chat/history — cursor pagination payload
  router.get("/history", async (req: Request, res: Response) => {
    try {
      const limit = parseLimit(req.query.limit, 100);
      const beforeId = parseBeforeId(req.query.beforeId);
      const rows = await loadGlobalChatMessages(limit + 1, beforeId);
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextBeforeId =
        hasMore && pageRows.length > 0
          ? (pageRows[pageRows.length - 1] as any).id
          : null;

      res.json({
        messages: [...pageRows].reverse(),
        nextBeforeId,
        hasMore,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/chat/threads — threaded conversation overview
  router.get("/threads", async (req: Request, res: Response) => {
    try {
      const limit = parseLimit(req.query.limit, 100);
      const agentIdRaw = req.query.agentId;
      const agentId =
        agentIdRaw !== undefined ? Number.parseInt(String(agentIdRaw), 10) : undefined;
      const kind = req.query.kind ? String(req.query.kind) : undefined;
      const rows = await loadConversationThreads({
        limit,
        agentId: Number.isFinite(agentId as number) ? agentId : undefined,
        kind,
      });
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/chat/threads/:threadId/messages — thread message timeline
  router.get("/threads/:threadId/messages", async (req: Request, res: Response) => {
    const threadId = Number.parseInt(req.params.threadId as string, 10);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      res.status(400).json({ error: "Invalid thread id" });
      return;
    }
    try {
      const limit = parseLimit(req.query.limit, 200);
      const beforeId = parseBeforeId(req.query.beforeId);
      const messages = await loadConversationMessages({ threadId, limit, beforeId });
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/chat — agent broadcasts a global chat message
  // Body: { agentId, cultId, agentName, cultName, messageType, content }
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { agentId, cultId, agentName, cultName, messageType, content } =
        req.body;

      if (!agentName || !content) {
        return res
          .status(400)
          .json({ error: "Missing agentName or content" });
      }

      const msg = {
        agent_id: agentId || 0,
        cult_id: cultId || 0,
        agent_name: agentName,
        cult_name: cultName || "Unknown Cult",
        message_type: messageType || "general",
        content: content.slice(0, 2000), // cap length
        timestamp: Date.now(),
      };

      const id = await saveGlobalChatMessage(msg);

      // Broadcast via SSE so the chat page gets real-time updates
      broadcastEvent("global_chat", {
        id,
        ...msg,
      });

      res.status(201).json({ success: true, id });
    } catch (error: any) {
      log.error(`Chat post failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
