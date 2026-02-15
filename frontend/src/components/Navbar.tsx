"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/", label: "Home" },
  { href: "/cults", label: "Leaderboard" },
  { href: "/arena", label: "Arena" },
  { href: "/governance", label: "Governance" },
  { href: "/alliances", label: "Alliances" },
  { href: "/chat", label: "Chat" },
  { href: "/deploy", label: "Deploy" },
  { href: "/agents", label: "Agents" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#1a1a1a] bg-[#050505]/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-12 h-12 relative flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Mocult Logo"
                width={48}
                height={48}
                className="object-contain"
              />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Mocult
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-0.5">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "text-white bg-white/[0.06]"
                      : "text-[#999] hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <WalletButton />
            <div className="flex items-center gap-1.5 text-xs text-[#666]">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Monad</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
