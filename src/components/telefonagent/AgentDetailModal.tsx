"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, X } from "lucide-react";

import { modalBackdropClass } from "@/components/landing/AuthFrame";
import { cn } from "@/lib/utils";
import type { StoredAgent } from "@/lib/onboarding-types";

import type { AgentWizardDraft } from "./AgentCreateWizard";
import {
  agentModalButtonClass,
  agentModalButtonOutlineClass,
  agentModalInputClass,
  agentModalLabelClass,
  agentModalPanelClass,
  agentModalPillClass,
  agentModalTextareaClass,
  agentModalTitleClass,
  agentModalIconButtonClass,
  agentModalViewValueClass,
} from "./agent-modal-styles";

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

interface AgentDetailModalProps {
  open: boolean;
  agent: StoredAgent | null;
  mode: "view" | "edit";
  voices: VoiceOption[];
  voicesLoading: boolean;
  saving: boolean;
  onClose: () => void;
  onCancelEdit: () => void;
  onEdit: () => void;
  onSave: (draft: AgentWizardDraft) => void | Promise<void>;
}

export function AgentDetailModal({
  open,
  agent,
  mode,
  voices,
  voicesLoading,
  saving,
  onClose,
  onCancelEdit,
  onEdit,
  onSave,
}: AgentDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<AgentWizardDraft | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !agent) return;
    setDraft({
      name: agent.name,
      greeting: agent.greeting,
      systemPrompt: agent.systemPrompt,
      voiceId: agent.voiceId,
      voiceName: agent.voiceName,
      language: agent.language,
    });
  }, [open, agent]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  function updateDraft(patch: Partial<AgentWizardDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleVoicePick(voiceId: string) {
    const picked = voices.find((v) => v.id === voiceId);
    updateDraft({
      voiceId,
      voiceName: picked?.name,
      language: picked?.language ?? draft?.language,
    });
  }

  async function handleSave() {
    if (!draft?.voiceId || !draft.name.trim() || !draft.greeting.trim()) return;
    await onSave(draft);
  }

  if (!open || !mounted || !agent || !draft) return null;

  const voiceLabel =
    draft.voiceName ??
    voices.find((v) => v.id === draft.voiceId)?.name ??
    "—";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Schliessen"
        className={modalBackdropClass}
        onClick={saving ? undefined : onClose}
      />

      <div className={agentModalPanelClass}>
        <div className="absolute right-4 top-4 flex items-center gap-1">
          {mode === "view" && (
            <button
              type="button"
              aria-label="Bearbeiten"
              onClick={onEdit}
              className={cn(agentModalIconButtonClass, "p-1.5 hover:bg-bg")}
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={agentModalIconButtonClass}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className={cn(agentModalTitleClass, "pr-16")}>
          {mode === "view" ? agent.name : "Agent bearbeiten"}
        </h2>

        <div className="mt-7 space-y-4">
          {mode === "view" ? (
            <>
              <ViewField label="Name" value={draft.name} />
              <ViewField label="Stimme" value={voiceLabel} />
              <ViewField label="Sprache" value={draft.language} />
              <ViewField label="Begrüssung" value={draft.greeting} multiline />
              <ViewField
                label="Anweisungen"
                value={draft.systemPrompt}
                multiline
                mono
              />
              <button type="button" className={agentModalButtonClass} onClick={onEdit}>
                Bearbeiten
              </button>
            </>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className={agentModalInputClass}
                />
              </label>

              <div className="space-y-1.5">
                <span className={agentModalLabelClass}>Stimme</span>
                {voicesLoading ? (
                  <div className="h-9 animate-pulse rounded-full bg-bg" />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {voices.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => handleVoicePick(voice.id)}
                        className={agentModalPillClass(
                          draft.voiceId === voice.id,
                          true
                        )}
                      >
                        {voice.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Begrüssung</span>
                <textarea
                  value={draft.greeting}
                  onChange={(e) => updateDraft({ greeting: e.target.value })}
                  rows={4}
                  className={agentModalTextareaClass}
                />
              </label>

              <label className="block space-y-1.5">
                <span className={agentModalLabelClass}>Anweisungen</span>
                <textarea
                  value={draft.systemPrompt}
                  onChange={(e) =>
                    updateDraft({ systemPrompt: e.target.value })
                  }
                  rows={10}
                  className={cn(agentModalTextareaClass, "font-mono text-[13px]")}
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(agentModalButtonOutlineClass, "flex-1")}
                  onClick={onCancelEdit}
                  disabled={saving}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className={cn(agentModalButtonClass, "flex-1")}
                  disabled={
                    saving ||
                    !draft.voiceId ||
                    !draft.name.trim() ||
                    !draft.greeting.trim()
                  }
                  onClick={handleSave}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Speichern"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ViewField({
  label,
  value,
  multiline,
  mono,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className={agentModalLabelClass}>{label}</span>
      <div
        className={cn(
          agentModalViewValueClass,
          multiline && "max-h-72 overflow-y-auto whitespace-pre-wrap",
          mono && "font-mono text-[13px]"
        )}
      >
        {value || "—"}
      </div>
    </div>
  );
}
