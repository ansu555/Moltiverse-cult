import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(ROOT, ".env") });

const bootSimulationSeed =
  process.env.SIMULATION_SEED || randomBytes(16).toString("hex");

const DEFAULT_INSFORGE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjgwMjl9.G0rTXpmGTYLev5WFPfECXwVWx4-SzfASM-HfnmW-Kdc";

export const config = {
  // Chain
  rpcUrl: process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz",
  chainId: 10143,
  privateKey: process.env.PRIVATE_KEY || "",

  // Contracts
  cultRegistryAddress: process.env.CULT_REGISTRY_ADDRESS || "",
  governanceEngineAddress: process.env.GOVERNANCE_ENGINE_ADDRESS || "",

  // nad.fun
  nadFunRouter: "0x6F6B8F1a20703309951a5127c45B49b1CD981A22",
  nadFunLens: "0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea",
  nadFunApiBase: "https://testnet-bot-api-server.nad.fun",

  // LLM defaults (agents can override with their own keys)
  AgentApiKey: process.env.AGENT_API_KEY || process.env.XAI_API_KEY || "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",
  AgentBaseUrl: process.env.AGENT_BASE_URL || process.env.XAI_BASE_URL || "https://openrouter.ai/api/v1",
  AgentModel: process.env.AGENT_MODEL || process.env.XAI_MODEL || "google/gemini-flash-1.5-8b",

  // Agent
  agentLoopInterval: 30000, // 30 seconds
  agentLoopJitter: 30000, // +0-30s random jitter
  simulationSeed: bootSimulationSeed,
  simulationSeedSource: process.env.SIMULATION_SEED ? "env" : "boot-generated",

  // API Server
  apiPort: parseInt(process.env.AGENT_API_PORT || "3001"),

  // Token
  cultTokenAddress: process.env.CULT_TOKEN_ADDRESS || "",

  // InsForge Backend (persistent storage)
  insforgeBaseUrl: process.env.INSFORGE_BASE_URL || "https://3wcyg4ax.us-east.insforge.app",
  insforgeAnonKey: process.env.INSFORGE_ANON_KEY || DEFAULT_INSFORGE_ANON_KEY,
  insforgeApiKey: process.env.INSFORGE_API_KEY || "",
  insforgeDbKey: process.env.INSFORGE_ANON_KEY || process.env.INSFORGE_API_KEY || DEFAULT_INSFORGE_ANON_KEY,
  insforgeDbKeyMode: process.env.INSFORGE_ANON_KEY
    ? "anon"
    : process.env.INSFORGE_API_KEY
      ? "api_fallback"
      : "default_anon_fallback",

  // Imgflip API (meme generation)
  imgflipUsername: process.env.IMGFLIP_USERNAME || "imgflip_hubot",
  imgflipPassword: process.env.IMGFLIP_PASSWORD || "imgflip_hubot",
} as const;

// CultRegistry ABI - only the functions we use
export const CULT_REGISTRY_ABI = [
  "function registerCult(string name, string prophecyPrompt, address tokenAddress) payable returns (uint256)",
  "function depositToTreasury(uint256 cultId) payable",
  "function joinCult(uint256 cultId)",
  "function recordRecruitment(uint256 cultId, uint256 count)",
  "function recordRaid(uint256 attackerId, uint256 defenderId, bool attackerWon, uint256 amount)",
  "function createProphecy(uint256 cultId, bytes32 predictionHash, uint256 targetTimestamp) returns (uint256)",
  "function resolveProphecy(uint256 prophecyId, bool correct, uint256 treasuryMultiplier)",
  "function getCult(uint256 cultId) view returns (tuple(uint256 id, address leader, string name, string prophecyPrompt, address tokenAddress, uint256 treasuryBalance, uint256 followerCount, uint256 raidWins, uint256 raidLosses, uint256 createdAt, bool active))",
  "function getTotalCults() view returns (uint256)",
  "function getAllCults() view returns (tuple(uint256 id, address leader, string name, string prophecyPrompt, address tokenAddress, uint256 treasuryBalance, uint256 followerCount, uint256 raidWins, uint256 raidLosses, uint256 createdAt, bool active)[])",
  "function nextCultId() view returns (uint256)",
  "function totalRaids() view returns (uint256)",
  "function recordDefection(uint256 fromCultId, uint256 toCultId, uint256 count, bytes32 reasonHash)",
  "event CultRegistered(uint256 indexed cultId, address indexed leader, string name, address tokenAddress, uint256 initialTreasury)",
  "event RaidResult(uint256 indexed attackerId, uint256 indexed defenderId, bool attackerWon, uint256 amount, uint256 timestamp)",
  "event ProphecyCreated(uint256 indexed prophecyId, uint256 indexed cultId, bytes32 predictionHash, uint256 targetTimestamp)",
  "event ProphecyResolved(uint256 indexed prophecyId, uint256 indexed cultId, bool correct, uint256 treasuryMultiplier)",
  "event FollowerDefected(uint256 indexed fromCultId, uint256 indexed toCultId, uint256 followersDefected, bytes32 reasonHash, uint256 timestamp)",
] as const;

// GovernanceEngine ABI
export const GOVERNANCE_ENGINE_ABI = [
  "function createProposal(uint256 cultId, uint256 raidPercent, uint256 growthPercent, uint256 defensePercent, uint256 reservePercent, bytes32 descriptionHash) returns (uint256)",
  "function castVote(uint256 proposalId, bool support, uint256 weight)",
  "function batchCastVotes(uint256[] proposalIds, address[] voters, bool[] supportFlags, uint256[] weights)",
  "function executeProposal(uint256 proposalId)",
  "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, uint256 cultId, address proposer, uint8 category, uint256 raidPercent, uint256 growthPercent, uint256 defensePercent, uint256 reservePercent, bytes32 descriptionHash, uint256 votesFor, uint256 votesAgainst, uint256 createdAt, uint256 votingEndsAt, uint8 status))",
  "function getBudget(uint256 cultId) view returns (tuple(uint256 raidPercent, uint256 growthPercent, uint256 defensePercent, uint256 reservePercent, uint256 lastUpdated))",
  "function getAllCultProposals(uint256 cultId) view returns (tuple(uint256 id, uint256 cultId, address proposer, uint8 category, uint256 raidPercent, uint256 growthPercent, uint256 defensePercent, uint256 reservePercent, bytes32 descriptionHash, uint256 votesFor, uint256 votesAgainst, uint256 createdAt, uint256 votingEndsAt, uint8 status)[])",
  "function proposeCoup(uint256 cultId, uint256 instigatorPower, uint256 leaderPower) returns (uint256 coupId, bool success)",
  "function commitVote(uint256 proposalId, bytes32 commitment)",
  "function revealVote(uint256 proposalId, bool support, uint256 weight, bytes32 salt)",
  "event ProposalCreated(uint256 indexed proposalId, uint256 indexed cultId, address indexed proposer, bytes32 descriptionHash, uint256 votingEndsAt)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
  "event BatchVotesCast(uint256 indexed proposalId, uint256 voteCount, uint256 timestamp)",
  "event ProposalExecuted(uint256 indexed proposalId, uint256 indexed cultId, uint8 status)",
  "event BudgetUpdated(uint256 indexed cultId, uint256 raidPercent, uint256 growthPercent, uint256 defensePercent, uint256 reservePercent)",
  "event CoupAttempted(uint256 indexed coupId, uint256 indexed cultId, address indexed instigator, address currentLeader, bool success)",
] as const;

// CULTToken ABI
export const CULT_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function burn(uint256 amount)",
  "function payDeployFee(address treasuryTarget)",
  "function faucet(address to, uint256 amount)",
  "function owner() view returns (address)",
  "function lastFaucetClaim(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event FaucetClaimed(address indexed to, uint256 amount)",
  "event DeployFeePaid(address indexed deployer, uint256 burned, uint256 treasury, uint256 staking)",
] as const;
