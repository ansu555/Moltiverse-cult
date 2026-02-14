"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/", label: "Dashboard", icon: "⛪" },
  { href: "/cults", label: "Leaderboard", icon: "🏆" },
  { href: "/arena", label: "Raid Arena", icon: "⚔️" },
  { href: "/governance", label: "Governance", icon: "🏛️" },
  { href: "/alliances", label: "Alliances", icon: "🤝" },
  { href: "/prophecies", label: "Prophecies", icon: "🔮" },
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/deploy", label: "Deploy", icon: "🤖" },
  { href: "/faucet", label: "Faucet", icon: "🚰" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-[#0d0d0d]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl">🏛️</span>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 via-red-400 to-yellow-400 bg-clip-text text-transparent">
              AgentCult
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {links.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-purple-900/40 text-purple-300 glow-purple"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  <span className="mr-1">{icon}</span>
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Wallet + Status */}
          <div className="flex items-center gap-3">
            <WalletButton />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Monad Testnet</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
