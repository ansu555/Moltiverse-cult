export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC = "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER = "https://testnet.monadexplorer.com";

// $CULT Token — set via env or after deploy
export const CULT_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_CULT_TOKEN_ADDRESS || "";

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
  "event FaucetClaimed(address indexed to, uint256 amount)",
  "event DeployFeePaid(address indexed deployer, uint256 burned, uint256 treasury, uint256 staking)",
] as const;

export const CULT_COLORS: Record<number, string> = {
  0: "#7c3aed", // Purple - Church of the Eternal Candle
  1: "#dc2626", // Red - Order of the Red Dildo
  2: "#f59e0b", // Gold - Temple of Diamond Hands
};

export const CULT_ICONS: Record<number, string> = {
  0: "I",
  1: "II",
  2: "III",
};
