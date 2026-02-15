import { Router, Request, Response } from "express";
import { stateStore, broadcastEvent } from "../server.js";
import {
  loadPlannerRunById,
  loadPlannerRuns,
  loadPlannerSteps,
} from "../../services/InsForgeService.js";

export const agentRoutes = Router();

// GET /api/agents - All agent statuses
agentRoutes.get("/", (_req: Request, res: Response) => {
  res.json(stateStore.agents);
});

// GET /api/agents/:id/plans - Planner runs for an agent DB id
agentRoutes.get("/:id/plans", async (req: Request, res: Response) => {
  const agentId = Number.parseInt(req.params.id as string, 10);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    res.status(400).json({ error: "Invalid agent id" });
    return;
  }
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20),
  );
  try {
    const runs = await loadPlannerRuns(agentId, limit);
    res.json(runs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agents/:id/plans/:planId/steps - Step history for a planner run
agentRoutes.get("/:id/plans/:planId/steps", async (req: Request, res: Response) => {
  const agentId = Number.parseInt(req.params.id as string, 10);
  const planId = Number.parseInt(req.params.planId as string, 10);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    res.status(400).json({ error: "Invalid agent id" });
    return;
  }
  if (!Number.isFinite(planId) || planId <= 0) {
    res.status(400).json({ error: "Invalid plan id" });
    return;
  }
  try {
    const run = await loadPlannerRunById(planId);
    if (!run || run.agent_id !== agentId) {
      res.status(404).json({ error: "Planner run not found for this agent" });
      return;
    }
    const steps = await loadPlannerSteps(planId);
    res.json(steps);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agents/:cultId - Single agent status
agentRoutes.get("/:cultId", (req: Request, res: Response) => {
  const cultId = parseInt(req.params.cultId as string);
  const agent = stateStore.agents.find((a) => a.cultId === cultId);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

// POST /api/agents/deploy - Deploy a new cult agent
agentRoutes.post("/deploy", (req: Request, res: Response) => {
  const { name, prophecyPrompt } = req.body;
  if (!name || !prophecyPrompt) {
    res.status(400).json({ error: "name and prophecyPrompt required" });
    return;
  }

  // Queue the new agent for deployment
  const newAgent = {
    cultId: stateStore.agents.length,
    name,
    status: "running" as const,
    dead: false,
    deathCause: null as string | null,
    lastAction: "Awaiting first cycle...",
    lastActionTime: Date.now(),
    totalProphecies: 0,
    totalRaids: 0,
    totalFollowersRecruited: 0,
  };

  // Add to agent state (the orchestrator will pick up on next sync)
  stateStore.agents.push(newAgent);

  // Also create a cult entry for the leaderboard
  stateStore.cults.push({
    id: newAgent.cultId,
    name,
    personality: prophecyPrompt.slice(0, 100),
    prophecyPrompt,
    tokenAddress: "",
    treasury: "0.0000",
    followers: 0,
    raidWins: 0,
    raidLosses: 0,
    createdAt: Date.now(),
  });

  broadcastEvent("agent:deployed", { name, cultId: newAgent.cultId });

  res.json({
    message: "Agent deployed successfully",
    cultId: newAgent.cultId,
    name,
    status: "running",
    note: "Agent is now running in autonomous mode. It will begin prophesying and raiding shortly.",
  });
});
