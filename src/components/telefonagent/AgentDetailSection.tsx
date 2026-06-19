"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface AgentDetailSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AgentDetailSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: AgentDetailSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded border border-[#E1E4EA]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-[#FAFAFA] px-3 py-2.5 text-left transition-colors hover:bg-[#F5F7FA]"
      >
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#0E121B]">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] text-[#99A0AE]">{subtitle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#99A0AE] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[#E1E4EA] bg-white p-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
