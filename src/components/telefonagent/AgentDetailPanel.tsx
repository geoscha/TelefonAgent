"use client";

import { Loader2, Pencil, Phone, Trash2 } from "lucide-react";

import {
  landingBtnGhost,
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import type { AgentWizardDraft } from "@/components/telefonagent/AgentCreateWizard";
import type { StoredAgent } from "@/lib/onboarding-types";
import { cn } from "@/lib/utils";

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

interface AgentDetailPanelProps {
  agent: StoredAgent;
  isActive: boolean;
  voices: VoiceOption[];
  voicesLoading: boolean;
  deleting: boolean;
  phoneNumbers?: Array<{ id: string; phoneNumber: string; label?: string }>;
  assigningPhone?: boolean;
  onAssignPhone?: (phoneNumberId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onActivate?: () => void;
  activating?: boolean;
  onVoiceChange?: (voiceId: string) => void;
}

export function AgentDetailPanel({
  agent,
  isActive,
  voices,
  voicesLoading,
  deleting,
  phoneNumbers = [],
  assigningPhone = false,
  onAssignPhone,
  onEdit,
  onDelete,
  onActivate,
  activating = false,
  onVoiceChange,
}: AgentDetailPanelProps) {
  const voiceLabel =
    agent.voiceName ??
    voices.find((v) => v.id === agent.voiceId)?.name ??
    "Stimme wählen";

  const assignedPhone = phoneNumbers.find((p) => p.id === agent.phoneNumberId);
  const singlePhone = phoneNumbers.length === 1 ? phoneNumbers[0] : null;
  const effectivePhone = assignedPhone ?? singlePhone;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className={`${userTitleClass} truncate`}>{agent.name}</h2>
              <button
                type="button"
                onClick={onEdit}
                aria-label="Agent bearbeiten"
                className={cn(landingBtnGhost, "h-8 min-h-8 w-8 justify-center px-0")}
              >
                <Pencil className="h-3.5 w-3.5 stroke-[1.5]" />
              </button>
            </div>
            <p className={`${userLabelClass} mt-1 truncate`}>
              ID: {agent.id}
            </p>
            {isActive && (
              <span className={`${userLabelClass} mt-2 inline-flex rounded bg-[#EBEEF4] px-2.5 py-0.5 text-[#335cff]`}>
                Aktiv
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Agent löschen"
            className={cn(
              landingBtnGhost,
              "h-9 min-h-9 w-9 justify-center px-0 hover:bg-red-50 hover:text-red-600"
            )}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
            )}
          </button>
        </div>

        {phoneNumbers.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <label className={userLabelClass} htmlFor="agent-phone">
              Telefonnummer
            </label>
            {phoneNumbers.length === 1 ? (
              <p className="font-mono text-[14px] text-[#0E121B]">
                {effectivePhone?.phoneNumber ?? phoneNumbers[0].phoneNumber}
              </p>
            ) : (
              <select
                id="agent-phone"
                value={agent.phoneNumberId ?? ""}
                disabled={assigningPhone || !onAssignPhone}
                onChange={(e) => onAssignPhone?.(e.target.value)}
                className="landing-body landing-radius-sm w-full max-w-sm border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20"
              >
                <option value="">Nummer wählen…</option>
                {phoneNumbers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phoneNumber}
                    {p.label ? ` · ${p.label}` : ""}
                  </option>
                ))}
              </select>
            )}
            {assigningPhone && (
              <p className="text-[11px] text-[#525866]">Wird zugewiesen…</p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="agent-voice">
            Stimme
          </label>
          <select
            id="agent-voice"
            value={agent.voiceId}
            disabled={voicesLoading || !onVoiceChange}
            onChange={(e) => onVoiceChange?.(e.target.value)}
            className="landing-body landing-radius-sm border border-[#E1E4EA] bg-white px-3 py-2 text-[#0E121B] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20"
          >
            {voices.length === 0 ? (
              <option value={agent.voiceId}>{voiceLabel}</option>
            ) : (
              voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled
            title="Demnächst verfügbar"
            className={cn(landingBtnSecondary, "cursor-not-allowed opacity-60")}
          >
            <Phone className="h-3.5 w-3.5 stroke-[1.75]" />
            Web-Anruf testen
          </button>
          {!isActive && onActivate && (
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className={landingBtnPrimary}
            >
              {activating ? "Aktivieren…" : "Als aktiv setzen"}
            </button>
          )}
        </div>
      </div>

      <div className={cn(userPanelClass, "p-5 sm:p-6")}>
        <h3 className={userTitleClass}>System-Prompt</h3>
        <p className={`${userLabelClass} mt-1`}>
          Anweisungen für die Gesprächsführung Ihres KI-Agenten.
        </p>
        <div className="mt-4 rounded border border-[#E1E4EA] bg-[#F5F7FA] px-4 py-3">
          <p className="whitespace-pre-wrap text-[14px] font-normal text-[#0E121B]">
            {agent.systemPrompt || "—"}
          </p>
        </div>
        <div className="mt-3 rounded border border-[#E1E4EA] bg-[#F5F7FA] px-4 py-3">
          <p className="text-[11px] font-normal text-[#99A0AE]">Begrüssung</p>
          <p className="mt-1 text-[14px] font-normal text-[#0E121B]">{agent.greeting || "—"}</p>
        </div>
      </div>
    </div>
  );
}

export type { AgentWizardDraft };
