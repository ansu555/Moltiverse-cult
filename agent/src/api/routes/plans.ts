import { Router, Request, Response } from "express";
import { createLogger } from "../../utils/logger.js";
import {
  loadPlannerRuns,
  loadPlannerRunById,
  loadPlannerSteps,
  loadPlannerStepResults,
} from "../../services/InsForgeService.js";

const log = createLogger("API:Plans");

/**
 * Planner routes — read-only API for inspecting agent plans and step results.
 *
 * GET /api/plans/agent/:agentId           — Recent plans for a specific agent
 * GET /api/plans/:planId                  — Single plan details
 * GET /api/plans/:planId/steps            — Steps + results for a plan
 */
export function plannerRoutes(): Router {
  const router = Router();

  // GET /api/plans/agent/:agentId — list recent plans
  router.get("/agent/:agentId", async (req: Request, res: Response) => {
    try {
      const agentId = parseInt(String(req.params.agentId), 10);
      if (!Number.isFinite(agentId) || agentId <= 0) {
        return res.status(400).json({ error: "Invalid agentId" });
      }
      const limit = Math.min(
        parseInt(String(req.query.limit ?? "20"), 10) || 20,
        100,
      );
      const runs = await loadPlannerRuns(agentId, limit);
      res.json(runs);
    } catch (error: any) {
      log.error(`Failed to load plans: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/plans/:planId — single plan detail
  router.get("/:planId", async (req: Request, res: Response) => {
    try {
      const planId = parseInt(String(req.params.planId), 10);
      if (!Number.isFinite(planId) || planId <= 0) {
        return res.status(400).json({ error: "Invalid planId" });
      }
      const run = await loadPlannerRunById(planId);
      if (!run) {
        return res.status(404).json({ error: "Plan not found" });
      }
      res.json(run);
    } catch (error: any) {
      log.error(`Failed to load plan: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/plans/:planId/steps — steps + results for a plan
  router.get("/:planId/steps", async (req: Request, res: Response) => {
    try {
      const planId = parseInt(String(req.params.planId), 10);
      if (!Number.isFinite(planId) || planId <= 0) {
        return res.status(400).json({ error: "Invalid planId" });
      }

      const [steps, results] = await Promise.all([
        loadPlannerSteps(planId),
        loadPlannerStepResults(planId),
      ]);

      // Merge results into steps for convenience
      const merged = steps.map((step) => {
        const result = results.find((r) => r.step_id === step.id);
        return { ...step, result: result ?? null };
      });

      res.json(merged);
    } catch (error: any) {
      log.error(`Failed to load plan steps: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
