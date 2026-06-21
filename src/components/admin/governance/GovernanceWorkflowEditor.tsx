"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { landingInputClass } from "@/components/landing/landing-buttons";
import type { GovernanceWorkflowInput } from "@/lib/governance/types";
import { cn } from "@/lib/utils";

function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        landingInputClass,
        "min-h-[72px] w-full resize-y py-2 leading-relaxed"
      )}
    />
  );
}

export function GovernanceWorkflowEditor({
  workflow,
  isNew,
  onSave,
  onDelete,
}: {
  workflow: GovernanceWorkflowInput;
  isNew: boolean;
  onSave: (input: GovernanceWorkflowInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(workflow);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDraft(workflow);
  }, [workflow]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`${adminPanelClass} space-y-4 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="landing-body font-medium text-[#0E121B]">
          {isNew ? "Neuer Workflow" : draft.name || "Workflow"}
        </h2>
        <div className="flex items-center gap-2">
          <Label className="landing-caption text-[#525866]">
            Global aktiv
          </Label>
          <Switch
            checked={draft.enabledGlobally}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, enabledGlobally: checked })
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="landing-caption">Name</Label>
          <Input
            className={landingInputClass}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label className="landing-caption">Slug</Label>
          <Input
            className={landingInputClass}
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            placeholder="schadensfall-meldung"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Beschreibung</Label>
        <TextArea
          value={draft.description}
          onChange={(value) => setDraft({ ...draft, description: value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Trigger / Intent</Label>
        <TextArea
          value={draft.triggerIntent}
          onChange={(value) => setDraft({ ...draft, triggerIntent: value })}
          placeholder="Wann greift dieser Workflow?"
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Ziele (je Zeile)</Label>
        <TextArea
          rows={4}
          value={draft.goals.join("\n")}
          onChange={(value) =>
            setDraft({ ...draft, goals: value.split("\n") })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">
          Pflicht-Slots (key|label|beschreibung je Zeile)
        </Label>
        <TextArea
          rows={5}
          value={draft.requiredSlots
            .map(
              (s) =>
                `${s.key}|${s.label}${s.description ? `|${s.description}` : ""}`
            )
            .join("\n")}
          onChange={(value) =>
            setDraft({
              ...draft,
              requiredSlots: value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [key, label, description] = line.split("|");
                  return {
                    key: key?.trim() ?? "",
                    label: label?.trim() ?? "",
                    description: description?.trim(),
                  };
                }),
            })
          }
          placeholder="name|Name|Name des Meldenden"
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">
          Optionale Slots (key|label je Zeile)
        </Label>
        <TextArea
          rows={3}
          value={draft.optionalSlots
            .map((s) => `${s.key}|${s.label}`)
            .join("\n")}
          onChange={(value) =>
            setDraft({
              ...draft,
              optionalSlots: value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [key, label] = line.split("|");
                  return {
                    key: key?.trim() ?? "",
                    label: label?.trim() ?? "",
                  };
                }),
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Geschäftslogik / Regeln</Label>
        <TextArea
          rows={5}
          value={draft.businessRules}
          onChange={(value) =>
            setDraft({ ...draft, businessRules: value })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[#E1E4EA] p-3">
          <p className="landing-body font-medium text-[#0E121B]">
            Telefon-Variante
          </p>
          <div className="space-y-2">
            <Label className="landing-caption">Anweisungen</Label>
            <TextArea
              value={draft.voiceVariant.instructions}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  voiceVariant: {
                    ...draft.voiceVariant,
                    instructions: value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="landing-caption">Slot-Erhebung</Label>
            <TextArea
              value={draft.voiceVariant.slotCollection ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  voiceVariant: {
                    ...draft.voiceVariant,
                    slotCollection: value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="landing-caption">Eskalation</Label>
            <TextArea
              value={draft.voiceVariant.escalation ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  voiceVariant: {
                    ...draft.voiceVariant,
                    escalation: value,
                  },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-[#E1E4EA] p-3">
          <p className="landing-body font-medium text-[#0E121B]">
            Nachrichten-Variante
          </p>
          <div className="space-y-2">
            <Label className="landing-caption">Anweisungen</Label>
            <TextArea
              value={draft.messageVariant.instructions}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  messageVariant: {
                    ...draft.messageVariant,
                    instructions: value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="landing-caption">Slot-Erhebung</Label>
            <TextArea
              value={draft.messageVariant.slotCollection ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  messageVariant: {
                    ...draft.messageVariant,
                    slotCollection: value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="landing-caption">Eskalation</Label>
            <TextArea
              value={draft.messageVariant.escalation ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  messageVariant: {
                    ...draft.messageVariant,
                    escalation: value,
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Fallback</Label>
        <TextArea
          value={draft.fallback}
          onChange={(value) => setDraft({ ...draft, fallback: value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">
          Beispiele (channel|dialog je Block, getrennt durch ---)
        </Label>
        <TextArea
          rows={6}
          value={draft.examples
            .map((e) => `${e.channel}\n${e.dialogue}`)
            .join("\n---\n")}
          onChange={(value) =>
            setDraft({
              ...draft,
              examples: value
                .split("\n---\n")
                .map((block) => block.trim())
                .filter(Boolean)
                .map((block) => {
                  const [channelLine, ...dialogueLines] = block.split("\n");
                  const channel =
                    channelLine?.trim() === "message" ? "message" : "voice";
                  return {
                    channel: channel as "voice" | "message",
                    dialogue: dialogueLines.join("\n").trim(),
                  };
                }),
            })
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Speichern
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Löschen
          </Button>
        )}
      </div>
    </div>
  );
}
