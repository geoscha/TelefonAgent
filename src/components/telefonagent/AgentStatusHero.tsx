"use client";

import { cn } from "@/lib/utils";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";

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
        userPanelClass,
        "flex items-center gap-4 px-5 py-4",
        className
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]"
        aria-hidden
      />
      <div>
        <p className={userLabelClass}>Agent aktiv</p>
        <p className={`${userTitleClass} mt-0.5`}>Telefonagent ist live</p>
        {phoneNumber && (
          <p className={`${userLabelClass} mt-1 tabular-nums`}>{phoneNumber}</p>
        )}
      </div>
    </div>
  );
}
