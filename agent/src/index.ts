import { ethers } from "ethers";
import { config } from "./config.js";
import { AgentOrchestrator } from "./core/AgentOrchestrator.js";
import { startApiServer, stateStore, broadcastEvent } from "./api/server.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("Main");

async function main() {
  log.info("🏛️ AgentCult: Emergent Religious Economies");
  log.info("============================================");
  log.info(`Network: Monad (Chain ${config.chainId})`);
  log.info(`RPC: ${config.rpcUrl}`);
  log.info(`Registry: ${config.cultRegistryAddress}`);

  // Initialize the agent orchestrator first (loads agents from InsForge DB)
  const orchestrator = new AgentOrchestrator();
  await orchestrator.bootstrap();

  // Start the Express API server with orchestrator for dynamic agent routes
  const apiPort = parseInt(process.env.API_PORT || "3001");
  startApiServer(apiPort, orchestrator);

  // Sync agent state into the API store every 3 seconds
  setInterval(() => {
    syncStateFromOrchestrator(orchestrator);
  }, 3000);

  await orchestrator.startAll();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    log.info("Shutting down agents...");
    orchestrator.stopAll();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log.info("Shutting down agents...");
    orchestrator.stopAll();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => { });
}

function syncStateFromOrchestrator(orchestrator: AgentOrchestrator) {
  // Sync agent states
  const agentStates = orchestrator.getAgentStates();
  stateStore.agents = agentStates.map((s) => ({
    cultId: s.cultId,
    name: s.personality.name,
    status: s.dead ? "dead" as const : s.running ? "running" as const : "stopped" as const,
    dead: s.dead,
    deathCause: s.deathCause,
    lastAction: s.lastAction,
    lastActionTime: s.lastActionTime,
    totalProphecies: s.propheciesGenerated,
    totalRaids: s.raidsInitiated,
    totalFollowersRecruited: s.followersRecruited,
  }));

  // Sync cults from on-chain data (cached in orchestrator)
  orchestrator
    .getCultsFromChain()
    .then((cults) => {
      stateStore.cults = cults.map((c) => ({
        id: c.id,
        name: c.name,
        personality: "",
        prophecyPrompt: c.prophecyPrompt,
        tokenAddress: c.tokenAddress,
        treasury: ethers.formatEther(c.treasuryBalance),
        followers: c.followerCount,
        raidWins: c.raidWins,
        raidLosses: c.raidLosses,
        createdAt: c.createdAt * 1000,
      }));
    })
    .catch(() => { });

  // Sync prophecies from ProphecyService
  const allProphecies = orchestrator.prophecyService.getAllProphecies();
  stateStore.prophecies = allProphecies.map((p) => ({
    id: p.id.toString(),
    cultId: p.cultId,
    cultName: p.cultName,
    text: p.prediction,
    prediction: p.prediction,
    confidence: p.confidence,
    resolved: p.resolved,
    correct: p.resolved ? p.correct : null,
    createdAt: p.createdAt,
    resolvedAt: p.resolved ? p.createdAt + 3600000 : null,
  }));

  // Sync raids from RaidService
  const allRaids = orchestrator.raidService.getAllRaids();
  stateStore.raids = allRaids.map((r) => ({
    id: r.id.toString(),
    attackerId: r.attackerId,
    attackerName: r.attackerName,
    defenderId: r.defenderId,
    defenderName: r.defenderName,
    amount: r.wagerAmount,
    attackerWon: r.attackerWon,
    scripture: r.reason,
    createdAt: r.timestamp,
  }));

  // Sync governance proposals
  const allProposals = orchestrator.governanceService.getAllProposals();
  stateStore.proposals = allProposals;

  // Sync alliance, memory, and defection data
  stateStore.alliances = orchestrator.allianceService.getAllAlliances();
  stateStore.activeAlliances = orchestrator.allianceService.getActiveAlliances();
  stateStore.betrayals = orchestrator.allianceService.getBetrayals();
  stateStore.defections = orchestrator.defectionService.getEvents();
  stateStore.memory = orchestrator.memoryService.getAllMemoryData();

  // Sync communication and evolution data
  stateStore.messages = orchestrator.communicationService.getAllMessages();
  stateStore.evolutionTraits = orchestrator.evolutionService.getAllTraits();
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
