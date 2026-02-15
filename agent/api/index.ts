import { AgentOrchestrator } from "../core/AgentOrchestrator.js";
import { createApiApp } from "../api/server.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Vercel");

// Global orchestrator instance (persists across function invocations)
let orchestrator: AgentOrchestrator | null = null;
let app: any = null;

async function initialize() {
  if (!orchestrator) {
    log.info("Cold start: Initializing orchestrator...");
    orchestrator = new AgentOrchestrator();
    await orchestrator.bootstrap();
    await orchestrator.startAll();
    log.ok("Orchestrator initialized");
  }
  
  if (!app) {
    log.info("Creating Express app...");
    const { app: expressApp } = createApiApp(orchestrator);
    app = expressApp;
    log.ok("Express app created");
  }
  
  return app;
}

// Vercel serverless function handler
export default async function handler(req: any, res: any) {
  try {
    const expressApp = await initialize();
    return expressApp(req, res);
  } catch (error) {
    log.error("Handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
