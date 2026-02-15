"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import { useScroll } from "@/components/ui/use-scroll";
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
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);
  const pathname = usePathname();

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close mobile menu on route change
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 mx-auto w-full max-w-6xl border-b border-transparent md:rounded-md md:border md:transition-all md:ease-out",
        {
          "bg-[#050505]/95 supports-[backdrop-filter]:bg-[#050505]/50 border-[#1a1a1a] backdrop-blur-lg md:top-4 md:max-w-5xl md:shadow-lg md:shadow-black/20":
            scrolled && !open,
          "bg-[#050505]/90": open,
        },
      )}
    >
      <nav
        className={cn(
          "flex h-16 w-full items-center justify-between px-5 md:h-14 md:transition-all md:ease-out",
          {
            "md:px-2": scrolled,
          },
        )}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo.png"
            alt="Mocult"
            width={96}
            height={96}
            className="w-10 h-10 object-contain"
          />
          <span className="text-lg font-bold text-white tracking-tight">
            Mocult
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "default" }),
                  active && "text-white bg-white/[0.06]",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Desktop right side */}
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-1.5 text-sm text-[#666] mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Monad</span>
          </div>
          <WalletButton />
        </div>

        {/* Mobile menu toggle */}
        <Button
          size="icon"
          variant="outline"
          onClick={() => setOpen(!open)}
          className="md:hidden"
        >
          <MenuToggleIcon open={open} className="size-5" duration={300} />
        </Button>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={cn(
          "bg-[#050505]/95 backdrop-blur-xl fixed top-16 right-0 bottom-0 left-0 z-50 flex flex-col overflow-hidden border-t border-[#1a1a1a] md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <div
          data-slot={open ? "open" : "closed"}
          className={cn(
            "data-[slot=open]:animate-in data-[slot=open]:zoom-in-95 data-[slot=closed]:animate-out data-[slot=closed]:zoom-out-95 ease-out",
            "flex h-full w-full flex-col justify-between gap-y-2 p-4",
          )}
        >
          <div className="grid gap-y-1">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    buttonVariants({
                      variant: "ghost",
                      className: "justify-start text-lg",
                    }),
                    active && "text-white bg-white/[0.06]",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 pb-6">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#666] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Connected to Monad Testnet</span>
            </div>
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
