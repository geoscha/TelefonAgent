"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StoredAgent } from "@/lib/onboarding-types";

interface AgentListProps {
  agents: StoredAgent[];
  activeAgentId?: string;
  selectedAgentId?: string;
  deletingId?: string | null;
  activatingId?: string | null;
  onActivate: (agentId: string) => void;
  onSelect: (agentId: string) => void;
  onEdit: (agentId: string) => void;
  onCreateNew: () => void;
  onDelete: (agentId: string) => void;
}

export function AgentList({
  agents,
  activeAgentId,
  selectedAgentId,
  deletingId,
  activatingId,
  onActivate,
  onSelect,
  onEdit,
  onCreateNew,
  onDelete,
}: AgentListProps) {
  const [pulseId, setPulseId] = useState<string | null>(null);
  const prevActiveId = useRef(activeAgentId);

  useEffect(() => {
    if (activeAgentId && activeAgentId !== prevActiveId.current) {
      setPulseId(activeAgentId);
      const timer = window.setTimeout(() => setPulseId(null), 220);
      prevActiveId.current = activeAgentId;
      return () => window.clearTimeout(timer);
    }
    prevActiveId.current = activeAgentId;
  }, [activeAgentId]);

  return (
    <div className="w-full overflow-hidden rounded-[18px] border border-stroke bg-white shadow-[0_8px_32px_-12px_rgba(20,36,46,0.12)]">
      <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
        <span className="text-[14px] font-medium text-navy">Agenten</span>
        <button
          type="button"
          onClick={onCreateNew}
          aria-label="Neuer Agent"
          className="flex h-8 w-8 items-center justify-center rounded-full text-navy transition-colors hover:bg-bg"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {agents.length === 0 ? (
        <button
          type="button"
          onClick={onCreateNew}
          className="w-full px-4 py-8 text-[13px] text-text-muted transition-colors hover:text-text"
        >
          + Agent erstellen
        </button>
      ) : (
        <ul className="divide-y divide-stroke" role="radiogroup" aria-label="Aktiver Agent">
          {agents.map((agent) => {
            const isActive = activeAgentId === agent.id;
            const isSelected = selectedAgentId === agent.id;
            const deleting = deletingId === agent.id;
            const activating = activatingId === agent.id;
            const pulsing = pulseId === agent.id;

            return (
              <li
                key={agent.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 transition-colors duration-150",
                  isSelected && "bg-baby-blue/20"
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${agent.name} als aktiv wählen`}
                  disabled={activating || deleting}
                  onClick={() => onActivate(agent.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors duration-150",
                      isActive
                        ? "border-accent bg-accent"
                        : "border-stroke bg-white hover:border-accent/50",
                      pulsing && "animate-agent-radio-select"
                    )}
                  >
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelect(agent.id)}
                  className="flex min-w-0 flex-1 py-1 text-left"
                >
                  <span className="truncate text-[14px] font-medium text-navy">
                    {agent.name}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="Bearbeiten"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(agent.id);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-navy"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>

                <button
                  type="button"
                  aria-label="Löschen"
                  disabled={deleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent.id);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
