"use client";

import { useWallet } from "@/hooks/useWallet";

export function WalletButton() {
  const { address, connected, error, connect, disconnect } = useWallet();

  if (connected && address) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-[#1a1a1a] rounded-md px-2.5 py-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          <span className="text-xs font-mono text-[#999]">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={disconnect}
          className="text-xs text-[#666] hover:text-red-400 transition-colors px-1.5 py-1"
        >
          &times;
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        className="bg-white/[0.06] hover:bg-white/[0.1] border border-[#1a1a1a] hover:border-[#2a2a2a] text-white text-xs font-medium px-3.5 py-1.5 rounded-md transition-colors"
      >
        Connect
      </button>
      {error && (
        <span className="text-[11px] text-red-400 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
