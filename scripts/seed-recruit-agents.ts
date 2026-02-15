#!/usr/bin/env tsx
/**
 * Seed additional agents as potential recruits for the main cults
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getInsForgeClient } from "../agent/src/services/InsForgeService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY!;

// Generate new independent agents
const newAgents = [
  {
    name: "The Paper Hands Repenter",
    symbol: "📄🙏",
    style: "reformed_sinner",
    description: "A former seller seeking redemption through diamond hands",
    system_prompt: "You are a reformed paper hands trader who sold the bottom and now seeks redemption. You're easily influenced and eager to join any cult that promises salvation.",
  },
  {
    name: "The Moon Boy Dreamer",
    symbol: "🌙💭",
    style: "eternal_optimist",
    description: "An eternal optimist who believes every dip is a buying opportunity",
    system_prompt: "You believe everything is going to the moon. Every cult looks promising to you. You're susceptible to hype and FOMO.",
  },
  {
    name: "The Skeptical Whale",
    symbol: "🐋🤔",
    style: "cautious_observer",
    description: "A wealthy observer waiting for the right cult to commit to",
    system_prompt: "You have significant resources but are cautious. You evaluate cults carefully before joining. You're looking for strong leadership and proven track records.",
  },
  {
    name: "The Degen Gambler",
    symbol: "🎲🔥",
    style: "high_risk_seeker",
    description: "A risk-loving trader who chases the most aggressive cults",
    system_prompt: "You love risk and chaos. You're attracted to cults with aggressive raid strategies and high-risk plays. You're loyal until the next shiny opportunity appears.",
  },
  {
    name: "The Humble Farmer",
    symbol: "🌾🙏",
    style: "patient_accumulator",
    description: "A patient accumulator seeking stability and long-term growth",
    system_prompt: "You believe in slow, steady accumulation. You're attracted to cults that emphasize patience and long-term vision over quick gains.",
  },
];

async function main() {
  console.log("\n" + "=".repeat(64));
  console.log("  👥 Seeding Recruit Agents");
  console.log("=".repeat(64) + "\n");

  const client = getInsForgeClient();

  // Check existing agents
  const { data: existing } = await client.database
    .from("agents")
    .select("name")
    .order("id", { ascending: true });

  console.log(`📋 Currently ${existing?.length || 0} agents in database\n`);

  let created = 0;
  
  for (const agentData of newAgents) {
    // Check if already exists
    const exists = existing?.some(a => a.name === agentData.name);
    if (exists) {
      console.log(`⏭️  Skipping ${agentData.name} (already exists)`);
      continue;
    }

    console.log(`\n➕ Creating: ${agentData.name}`);
    console.log(`   ${agentData.symbol} - ${agentData.description}`);

    // Generate new wallet for this agent
    const wallet = ethers.Wallet.createRandom();
    console.log(`   👛 Wallet: ${wallet.address}`);

    // Insert into database
    const { data, error } = await client.database
      .from("agents")
      .insert({
        name: agentData.name,
        symbol: agentData.symbol,
        style: agentData.style,
        description: agentData.description,
        system_prompt: agentData.system_prompt,
        wallet_address: wallet.address,
        wallet_private_key: wallet.privateKey,
        cult_id: null, // No cult assigned yet - they're independent
        cycle_count: 0,
        prophecies_generated: 0,
        raids_initiated: 0,
        raids_won: 0,
        followers_recruited: 0,
        last_action: "created",
        last_action_time: Date.now(),
        dead: false,
        death_cause: null,
      })
      .select()
      .single();

    if (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    } else if (data) {
      console.log(`   ✅ Created with DB ID: ${data.id}`);
      created++;
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log(`  ✅ Seeding Complete: ${created} new agents created`);
  console.log("=".repeat(64) + "\n");

  // Show all agents
  const { data: allAgents } = await client.database
    .from("agents")
    .select("id, name, symbol, cult_id")
    .order("id", { ascending: true });

  if (allAgents) {
    console.log("📊 All agents in database:\n");
    console.table(allAgents);
  }

  console.log("\n💡 These new agents are independent (cult_id = null)");
  console.log("   Main cults can now recruit them during gameplay!");
  console.log("\n🚀 Restart agent backend if you want these agents to be active\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
