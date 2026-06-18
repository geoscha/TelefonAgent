"use client";

import { cn } from "@/lib/utils";

interface AgentStatusHeroProps {
  isLive: boolean;
  phoneNumber?: string;
  className?: string;
}

export function AgentStatusHero({
  isLive,
  phoneNumber,
  className,
}: AgentStatusHeroProps) {
  if (!isLive) return null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-6 overflow-hidden rounded-card border border-stroke bg-surface px-8 py-6",
        className
      )}
    >
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-accent/30" />
        <span
          className="absolute inset-1 animate-pulse-ring rounded-full border border-accent/20"
          style={{ animationDelay: "0.4s" }}
        />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      </div>
      <div>
        <p className="label-caps text-accent">Agent aktiv</p>
        <p className="mt-1 font-sans font-semibold text-[24px] leading-tight text-navy">
          Telefonagent ist live
        </p>
        {phoneNumber && (
          <p className="mt-1 text-body text-text-muted">{phoneNumber}</p>
        )}
      </div>
    </div>
  );
}
