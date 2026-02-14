import { Router, Request, Response } from "express";
import { stateStore, broadcastEvent } from "../server.js";

export const agentRoutes = Router();

// GET /api/agents - All agent statuses
agentRoutes.get("/", (_req: Request, res: Response) => {
  res.json(stateStore.agents);
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
