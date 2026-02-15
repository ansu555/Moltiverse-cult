"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MenuToggleIconProps extends React.SVGAttributes<SVGSVGElement> {
  open: boolean;
  duration?: number;
}

export function MenuToggleIcon({
  open,
  duration = 300,
  className,
  ...props
}: MenuToggleIconProps) {
  const style = {
    transition: `transform ${duration}ms ease, opacity ${duration}ms ease`,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5", className)}
      {...props}
    >
      {/* Top bar */}
      <line
        x1="4"
        y1="7"
        x2="20"
        y2="7"
        style={{
          ...style,
          transform: open ? "translateY(5px) rotate(45deg)" : "none",
          transformOrigin: "center",
        }}
      />
      {/* Middle bar */}
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        style={{
          ...style,
          opacity: open ? 0 : 1,
        }}
      />
      {/* Bottom bar */}
      <line
        x1="4"
        y1="17"
        x2="20"
        y2="17"
        style={{
          ...style,
          transform: open ? "translateY(-5px) rotate(-45deg)" : "none",
          transformOrigin: "center",
        }}
      />
    </svg>
  );
}
