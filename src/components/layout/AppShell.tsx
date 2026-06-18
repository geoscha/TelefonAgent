"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionTemplate,
} from "framer-motion";
import { GlassNav } from "@/components/layout/GlassNav";
import { CommandPalette } from "@/components/layout/CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });

  // Top fade band: 0px at the very top (banner reads crisp) → ~56px once scrolled,
  // so content dissolves exactly at the boundary line as it rolls in.
  const fade = useTransform(scrollY, [0, 64], [0, 56]);
  const maskImage = useMotionTemplate`linear-gradient(to bottom, transparent 0px, black ${fade}px, black 100%)`;

  return (
    <div className="h-screen overflow-hidden bg-bg">
      {/* Floating frosted menu — fixed layer above the scroll container */}
      <GlassNav />

      {/* Scroll container starts at the boundary Y (nav height + gap). Content can
          never enter the gap above this line; the mask fades it out as it reaches the top. */}
      <motion.main
        ref={scrollRef}
        style={{ WebkitMaskImage: maskImage, maskImage }}
        className="fixed inset-x-0 bottom-0 top-[7rem] overflow-y-auto overflow-x-hidden"
      >
        <div className="mx-auto max-w-content px-6 pb-16 lg:px-10">
          {children}
        </div>
      </motion.main>

      <CommandPalette />
    </div>
  );
}
