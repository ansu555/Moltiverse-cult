import express from "express";
import cors from "cors";
import { createLogger } from "../utils/logger.js";
import { cultRoutes } from "./routes/cults.js";
import { prophecyRoutes } from "./routes/prophecies.js";
import { raidRoutes } from "./routes/raids.js";
import { agentRoutes } from "./routes/agents.js";
import { governanceRoutes } from "./routes/governance.js";
import { allianceRoutes } from "./routes/alliances.js";
import { communicationRoutes } from "./routes/communication.js";
import { sseRoutes } from "./routes/sse.js";
import { agentCreationRoutes } from "./routes/agentCreation.js";
import { memeTransferRoutes } from "./routes/memeTransfers.js";
import { chatRoutes } from "./routes/chat.js";
import { plannerRoutes } from "./routes/plans.js";
import type { AgentOrchestrator } from "../core/AgentOrchestrator.js";

const log = createLogger("API");

// In-memory state store shared across routes
export interface StateStore {
  cults: CultInfo[];
  prophecies: ProphecyInfo[];
  raids: RaidInfo[];
  agents: AgentInfo[];
  proposals: any[];
  budgets: Record<number, any>;
  alliances: any[];
  activeAlliances: any[];
  betrayals: any[];
  defections: any[];
  memory: Record<number, any>;
  messages: any[];
  evolutionTraits: Record<number, any>;
  groupMemberships: any[];
  leadershipStates: Record<number, any>;
  leadershipElections: any[];
  bribeOffers: any[];
  sseClients: express.Response[];
}

export interface CultInfo {
  id: number;
  name: string;
  personality: string;
  prophecyPrompt: string;
  tokenAddress: string;
  treasury: string;
  followers: number;
  raidWins: number;
  raidLosses: number;
  createdAt: number;
}

export interface ProphecyInfo {
  id: string;
  cultId: number;
  cultName: string;
  text: string;
  prediction: string;
  confidence: number;
  resolved: boolean;
  correct: boolean | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface RaidInfo {
  id: string;
  attackerId: number;
  attackerName: string;
  defenderId: number;
  defenderName: string;
  amount: string;
  attackerWon: boolean;
  scripture: string;
  createdAt: number;
}

export interface AgentInfo {
  cultId: number;
  name: string;
  status: "running" | "stopped" | "idle" | "dead";
  dead: boolean;
  deathCause: string | null;
  lastAction: string;
  lastActionTime: number;
  totalProphecies: number;
  totalRaids: number;
  totalFollowersRecruited: number;
}

// Global state store
export const stateStore: StateStore = {
  cults: [],
  prophecies: [],
  raids: [],
  agents: [],
  proposals: [],
  budgets: {},
  alliances: [],
  activeAlliances: [],
  betrayals: [],
  defections: [],
  memory: {},
  messages: [],
  evolutionTraits: {},
  groupMemberships: [],
  leadershipStates: {},
  leadershipElections: [],
  bribeOffers: [],
  sseClients: [],
};

// Broadcast event to all SSE clients
export function broadcastEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  stateStore.sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      // Client disconnected
    }
  });
}

export function startApiServer(port: number, orchestrator?: AgentOrchestrator) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      cults: stateStore.cults.length,
      agents: stateStore.agents.length,
    });
  });

  // Mount routes
  app.use("/api/cults", cultRoutes);
  // PROPHECY_DISABLED_START
  app.use("/api/prophecies", prophecyRoutes);
  // PROPHECY_DISABLED_END
  app.use("/api/raids", raidRoutes);
  app.use("/api/governance", governanceRoutes);
  app.use("/api/alliances", allianceRoutes(stateStore));
  app.use("/api/communication", communicationRoutes(stateStore));
  app.use("/api/events", sseRoutes);

  // Mount dynamic agent management routes (require orchestrator)
  if (orchestrator) {
    app.use("/api/agents/management", agentCreationRoutes(orchestrator));
    app.use("/api/social", memeTransferRoutes(orchestrator));
    app.use("/api/chat", chatRoutes(orchestrator));
    app.use("/api/plans", plannerRoutes());
  }

  // Mount static agent routes last (after specific paths)
  app.use("/api/agents", agentRoutes);

  // Stats endpoint
  app.get("/api/stats", (_req, res) => {
    const totalTreasury = stateStore.cults.reduce(
      (sum, c) => sum + parseFloat(c.treasury || "0"),
      0,
    );
    const totalFollowers = stateStore.cults.reduce(
      (sum, c) => sum + c.followers,
      0,
    );
    const totalRaids = stateStore.raids.length;
    const totalProphecies = stateStore.prophecies.length;
    const activeProphecies = stateStore.prophecies.filter(
      (p) => !p.resolved,
    ).length;

    res.json({
      totalCults: stateStore.cults.length,
      totalTreasury: totalTreasury.toFixed(4),
      totalFollowers,
      totalRaids,
      totalProphecies,
      activeProphecies,
      activeAgents: stateStore.agents.filter((a) => a.status === "running")
        .length,
    });
  });

  app.listen(port, () => {
    log.section("API Server Online");
    log.table("Server Config", {
      url: `http://localhost:${port}`,
      health: `http://localhost:${port}/api/health`,
      routes: "cults, prophecies, raids, governance, alliances, agents, chat",
      sse: `http://localhost:${port}/api/events`,
    });
  });

  return app;
}
