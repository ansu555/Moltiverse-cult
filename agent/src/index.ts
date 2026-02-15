import { ethers } from "ethers";
import { config } from "./config.js";
import { AgentOrchestrator } from "./core/AgentOrchestrator.js";
import { startApiServer, stateStore, broadcastEvent } from "./api/server.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("Main");

async function main() {
  log.section("🏩 Mocult: Emergent Religious Economies");
  log.table("Configuration", {
    network: `Monad (chain ${config.chainId})`,
    rpc: config.rpcUrl,
    registry: config.cultRegistryAddress,
    apiPort: config.apiPort,
  });

  // Initialize the agent orchestrator first (loads agents from InsForge DB)
  const orchestrator = new AgentOrchestrator();

  try {
    await orchestrator.bootstrap();
  } catch (err: any) {
    log.errorWithContext("Bootstrap failed — cannot start", err);
    process.exit(1);
  }

  // Start the Express API server with orchestrator for dynamic agent routes
  const apiPort = config.apiPort;
  startApiServer(apiPort, orchestrator);

  // Sync agent state into the API store every 3 seconds
  setInterval(() => {
    syncStateFromOrchestrator(orchestrator);
  }, 3000);

  await orchestrator.startAll();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.section(`Shutdown (${signal})`);
    log.info("Stopping all agent loops...");
    orchestrator.stopAll();
    log.ok("All agents stopped. Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason: any) => {
    log.errorWithContext("Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (err) => {
    log.errorWithContext("Uncaught exception — shutting down", err);
    orchestrator.stopAll();
    process.exit(1);
  });

  // Keep process alive
  await new Promise(() => {});
}

function syncStateFromOrchestrator(orchestrator: AgentOrchestrator) {
  // Sync agent states
  const agentStates = orchestrator.getAgentStates();
  stateStore.agents = agentStates.map((s) => ({
    cultId: s.cultId,
    name: s.personality.name,
    status: s.dead
      ? ("dead" as const)
      : s.running
      ? ("running" as const)
      : ("stopped" as const),
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
    .catch(() => {});

  // Sync prophecies from ProphecyService
  // PROPHECY_DISABLED_START
  // const allProphecies = orchestrator.prophecyService.getAllProphecies();
  // stateStore.prophecies = allProphecies.map((p) => ({
  //   id: p.id.toString(),
  //   cultId: p.cultId,
  //   cultName: p.cultName,
  //   text: p.prediction,
  //   prediction: p.prediction,
  //   confidence: p.confidence,
  //   resolved: p.resolved,
  //   correct: p.resolved ? p.correct : null,
  //   createdAt: p.createdAt,
  //   resolvedAt: p.resolved ? p.createdAt + 3600000 : null,
  // }));
  stateStore.prophecies = [];
  // PROPHECY_DISABLED_END

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
  stateStore.budgets = orchestrator.governanceService.getAllBudgets();

  // Sync alliance, memory, and defection data
  stateStore.alliances = orchestrator.allianceService.getAllAlliances();
  stateStore.activeAlliances =
    orchestrator.allianceService.getActiveAlliances();
  stateStore.betrayals = orchestrator.allianceService.getBetrayals();
  stateStore.defections = orchestrator.defectionService.getEvents();
  stateStore.memory = orchestrator.memoryService.getAllMemoryData();

  // Sync communication and evolution data
  stateStore.messages = orchestrator.communicationService.getAllMessages();
  stateStore.evolutionTraits = orchestrator.evolutionService.getAllTraits();
  stateStore.groupMemberships =
    orchestrator.groupGovernanceService.getAllMemberships();
  stateStore.leadershipElections =
    orchestrator.groupGovernanceService.getElections();
  stateStore.bribeOffers = orchestrator.groupGovernanceService.getBribeOffers({
    limit: 500,
  });
  stateStore.leadershipStates = stateStore.cults.reduce(
    (acc: Record<number, any>, cult) => {
      const leadership =
        orchestrator.groupGovernanceService.getCurrentLeadership(cult.id);
      const electionInfo =
        orchestrator.groupGovernanceService.getNextElectionInfo(cult.id);
      acc[cult.id] = {
        ...leadership,
        ...electionInfo,
      };
      return acc;
    },
    {},
  );
}

main().catch((err) => {
  log.errorWithContext("Fatal startup error", err);
  process.exit(1);
});
