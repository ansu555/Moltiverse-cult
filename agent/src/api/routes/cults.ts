import { Router, Request, Response } from "express";
import { filterCultsByScope, parseDataScope, stateStore } from "../server.js";

export const cultRoutes = Router();

// GET /api/cults - List all cults sorted by treasury
cultRoutes.get("/", (req: Request, res: Response) => {
  const scope = parseDataScope(req.query.scope);
  const sorted = filterCultsByScope(scope).sort(
    (a, b) => parseFloat(b.treasury) - parseFloat(a.treasury),
  );
  res.json(sorted);
});

// GET /api/cults/leaderboard - Ranked leaderboard (MUST be before /:id)
cultRoutes.get("/leaderboard", (req: Request, res: Response) => {
  const scope = parseDataScope(req.query.scope);
  const leaderboard = filterCultsByScope(scope)
    .sort((a, b) => parseFloat(b.treasury) - parseFloat(a.treasury))
    .map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      treasury: c.treasury,
      followers: c.followers,
      raidWins: c.raidWins,
      raidLosses: c.raidLosses,
    }));
  res.json(leaderboard);
});

// GET /api/cults/:id/members - Active group membership roster
cultRoutes.get("/:id/members", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const members = (stateStore.groupMemberships || [])
    .filter((m: any) => m.cultId === id && m.active)
    .sort((a: any, b: any) => a.joinedAt - b.joinedAt);
  res.json(members);
});

// GET /api/cults/:id/leadership/current - Current leader snapshot
cultRoutes.get("/:id/leadership/current", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const state = (stateStore.leadershipStates || {})[id] || {
    cultId: id,
    leaderAgentId: null,
    roundIndex: 0,
    electionId: null,
    updatedAtCycle: 0,
    nextElectionCycle: null,
    currentCycle: 0,
    etaCycles: null,
  };
  res.json(state);
});

// GET /api/cults/:id/leadership/elections - Election history and status
cultRoutes.get("/:id/leadership/elections", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const elections = (stateStore.leadershipElections || [])
    .filter((e: any) => e.cultId === id)
    .sort((a: any, b: any) => b.openedAt - a.openedAt);
  res.json(elections);
});

// GET /api/cults/:id - Get single cult details
cultRoutes.get("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const cult = stateStore.cults.find((c) => c.id === id);
  if (!cult) {
    res.status(404).json({ error: "Cult not found" });
    return;
  }

  // Include recent prophecies and raids for this cult
  const prophecies = stateStore.prophecies
    .filter((p) => p.cultId === id)
    .slice(-20);
  const raids = stateStore.raids
    .filter((r) => r.attackerId === id || r.defenderId === id)
    .slice(-20);

  res.json({ ...cult, prophecies, raids });
});

// GET /api/cults/:id/prophecies
cultRoutes.get("/:id/prophecies", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const prophecies = stateStore.prophecies
    .filter((p) => p.cultId === id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(prophecies);
});

// GET /api/cults/:id/raids
cultRoutes.get("/:id/raids", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const raids = stateStore.raids
    .filter((r) => r.attackerId === id || r.defenderId === id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(raids);
});
