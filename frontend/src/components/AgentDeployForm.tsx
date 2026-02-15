"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/constants";

export function AgentDeployForm() {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !prompt) return;

    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/agents/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prophecyPrompt: prompt }),
      });
      const data = await res.json();
      setMessage(data.message || data.note || "Deployed!");
      setStatus("success");
    } catch {
      setMessage("Failed to deploy agent");
      setStatus("error");
    }
  };

  return (
    <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d]">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        Deploy New Cult Agent
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Cult Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Church of the Moon"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Prophecy Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="You are a mystical crypto prophet who sees market patterns in the stars..."
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading" || !name || !prompt}
          className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {status === "loading" ? "Deploying..." : "Deploy Agent"}
        </button>
      </form>
      {status !== "idle" && (
        <p
          className={`mt-3 text-xs ${
            status === "success"
              ? "text-green-400"
              : status === "error"
              ? "text-red-400"
              : "text-gray-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
