"use client";

import { Plus } from "lucide-react";

import {
  landingBtnSecondary,
  landingPanelClass,
} from "@/components/landing/landing-buttons";
import type { StoredAgent } from "@/lib/onboarding-types";
import { cn } from "@/lib/utils";

interface RetellAgentSidebarProps {
  agents: StoredAgent[];
  selectedAgentId?: string | null;
  activeAgentId?: string;
  onSelect: (agentId: string) => void;
  onCreateNew: () => void;
}

export function RetellAgentSidebar({
  agents,
  selectedAgentId,
  activeAgentId,
  onSelect,
  onCreateNew,
}: RetellAgentSidebarProps) {
  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-2 lg:w-[220px]">
      <button
        type="button"
        onClick={onCreateNew}
        className={cn(landingBtnSecondary, "w-full justify-start gap-2")}
      >
        <Plus className="h-3.5 w-3.5 stroke-[1.75]" />
        Agent hinzufügen
      </button>

      <div
        className={cn(
          landingPanelClass,
          "flex min-h-0 flex-1 flex-col overflow-hidden"
        )}
      >
        {agents.length === 0 ? (
          <p className="landing-body px-3 py-6 text-center text-[#99A0AE]">
            Noch keine Agenten
          </p>
        ) : (
          <ul className="divide-y divide-[#E1E4EA]">
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.id;
              const active = activeAgentId === agent.id;
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(agent.id)}
                    className={cn(
                      "landing-body flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-[#F5F7FA] text-[#0E121B]"
                        : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
                    )}
                  >
                    {active && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#335cff]"
                        aria-label="Aktiv"
                      />
                    )}
                    <span className="truncate">{agent.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
