import { Router, Request, Response } from "express";
import { loadAgentMessages } from "../../services/InsForgeService.js";

export function communicationRoutes(stateStore: any): Router {
    const router = Router();

    const toClientMessage = (row: any) => ({
        id: row.id,
        type: row.type,
        fromCultId: row.from_cult_id,
        fromCultName: row.from_cult_name,
        targetCultId: row.target_cult_id,
        targetCultName: row.target_cult_name,
        content: row.content,
        timestamp: row.timestamp,
        visibility:
            row.visibility ||
            (row.is_private ? "private" : "public"),
        isPrivate:
            typeof row.is_private === "boolean"
                ? row.is_private
                : row.visibility === "private",
        channelId: row.channel_id,
        relatedBribeId: row.related_bribe_id,
    });

    const parseLimit = (raw: unknown, fallback = 200) => {
        const n = Number.parseInt(String(raw ?? fallback), 10);
        if (!Number.isFinite(n) || n <= 0) return fallback;
        return Math.min(n, 500);
    };

    // GET /api/communication — recent agent messages
    router.get("/", async (req: Request, res: Response) => {
        try {
            const scopeRaw = String(req.query.scope || "all");
            const scope =
                scopeRaw === "public" ||
                scopeRaw === "private" ||
                scopeRaw === "leaked"
                    ? scopeRaw
                    : "all";
            const limit = parseLimit(req.query.limit, 200);
            const cultIdParam = req.query.cultId;
            const cultId =
                cultIdParam !== undefined
                    ? Number.parseInt(String(cultIdParam), 10)
                    : undefined;

            const rows = await loadAgentMessages(limit, {
                scope,
                cultId: Number.isFinite(cultId as number) ? cultId : undefined,
            });
            if (rows.length > 0) {
                res.json(rows.map(toClientMessage));
                return;
            }

            // Legacy fallback path for pre-persistence sessions.
            const fallback = (stateStore.messages || []).filter((m: any) => {
                if (scope === "public") return !m.isPrivate && m.visibility !== "private";
                if (scope === "private") return !!m.isPrivate || m.visibility === "private";
                if (scope === "leaked") return m.visibility === "leaked";
                return true;
            });
            res.json(fallback.slice(0, limit));
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/communication/cult/:cultId — messages from a specific cult
    router.get("/cult/:cultId", async (req: Request, res: Response) => {
        const cultId = parseInt(req.params.cultId as string);
        const limit = parseLimit(req.query.limit, 200);
        const scopeRaw = String(req.query.scope || "all");
        const scope =
            scopeRaw === "public" ||
            scopeRaw === "private" ||
            scopeRaw === "leaked"
                ? scopeRaw
                : "all";

        try {
            const rows = await loadAgentMessages(limit, { cultId, scope });
            if (rows.length > 0) {
                res.json(rows.map(toClientMessage));
                return;
            }
            const allMessages = stateStore.messages || [];
            res.json(allMessages.filter((m: any) => m.fromCultId === cultId).slice(0, limit));
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/communication/evolution — evolution traits for all cults
    router.get("/evolution", (_req: Request, res: Response) => {
        res.json(stateStore.evolutionTraits || {});
    });

    return router;
}
