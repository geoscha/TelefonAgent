"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { landingInputClass } from "@/components/landing/landing-buttons";
import type { AdminSecretEntry } from "@/lib/admin/secrets-inventory-types";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER = [
  "Supabase",
  "Admin",
  "Stripe",
  "ElevenLabs",
  "Twilio",
  "Kalender",
  "KI & Anreicherung",
  "Agent",
  "E-Mail",
  "Demo",
];

function SecretRow({
  entry,
  copiedId,
  editingId,
  draft,
  saving,
  onCopy,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
}: {
  entry: AdminSecretEntry;
  copiedId: string | null;
  editingId: string | null;
  draft: string;
  saving: boolean;
  onCopy: (entry: AdminSecretEntry) => void;
  onStartEdit: (entry: AdminSecretEntry) => void;
  onCancelEdit: () => void;
  onDraftChange: (value: string) => void;
  onSave: (entry: AdminSecretEntry) => void;
}) {
  const copied = copiedId === entry.id;
  const editing = editingId === entry.id;
  const isSecret = entry.inputType === "secret";

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="landing-body text-[#0E121B]">{entry.label}</p>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                entry.configured
                  ? "border-[#335cff]/20 bg-[#EBEEF4] text-[#335cff]"
                  : "border-[#E1E4EA] bg-[#F5F7FA] text-[#99A0AE]"
              )}
            >
              {entry.configured ? "Aktiv" : "Fehlt"}
            </span>
            <span className="landing-caption text-[#99A0AE]">
              {entry.source === "env" ? "Env" : "DB"}
            </span>
          </div>
          {!editing ? (
            <p className="mt-1 font-mono text-[12px] text-[#525866]">
              {entry.configured ? entry.masked : "Nicht gesetzt"}
            </p>
          ) : null}
          {entry.hint ? (
            <p className="mt-0.5 font-mono text-[11px] text-[#99A0AE]">
              {entry.hint}
              {!entry.editable && entry.source === "env"
                ? " · nur in Vercel änderbar"
                : null}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {entry.editable && !editing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onStartEdit(entry)}
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!entry.configured || editing}
            onClick={() => onCopy(entry)}
            title="In Zwischenablage kopieren"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type={isSecret ? "password" : entry.inputType === "tel" ? "tel" : "text"}
            className={cn(landingInputClass, "font-mono text-[13px]")}
            placeholder={entry.configured ? "Neuer Wert…" : "Wert eingeben…"}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            autoFocus
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              disabled={saving || !draft.trim()}
              onClick={() => onSave(entry)}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Speichern"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={onCancelEdit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddIntegrationForm({
  type,
  onAdded,
}: {
  type: "twilio" | "elevenlabs";
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body =
        type === "twilio"
          ? {
              type,
              label: label.trim(),
              accountSid: accountSid.trim(),
              authToken: authToken.trim(),
              isDefault: false,
            }
          : {
              type,
              label: label.trim(),
              apiKey: apiKey.trim(),
              isDefault: false,
            };

      const res = await fetch("/api/admin/integration-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Hinzufügen fehlgeschlagen.");
        return;
      }

      toast.success("Konto hinzugefügt.");
      setLabel("");
      setAccountSid("");
      setAuthToken("");
      setApiKey("");
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2 text-[12px] text-[#525866] hover:bg-[#F5F7FA]"
      >
        <Plus className="h-3.5 w-3.5" />
        {type === "twilio" ? "Twilio-Konto hinzufügen" : "ElevenLabs-Konto hinzufügen"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-2 border-t border-[#E1E4EA] bg-[#FAFAFA] p-3"
    >
      <Input
        className={landingInputClass}
        placeholder="Bezeichnung"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
      />
      {type === "twilio" ? (
        <>
          <Input
            className={cn(landingInputClass, "font-mono")}
            placeholder="Account SID"
            value={accountSid}
            onChange={(event) => setAccountSid(event.target.value)}
            required
          />
          <Input
            type="password"
            className={cn(landingInputClass, "font-mono")}
            placeholder="Auth Token"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            required
          />
        </>
      ) : (
        <Input
          type="password"
          className={cn(landingInputClass, "font-mono")}
          placeholder="API Key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          required
        />
      )}
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "…" : "Hinzufügen"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

export function AdminSecretsSection() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Record<string, AdminSecretEntry[]>>({});
  const [stats, setStats] = useState({ configured: 0, total: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    setGroups((data.groups ?? {}) as Record<string, AdminSecretEntry[]>);
    setStats({
      configured: (data.configuredCount as number) ?? 0,
      total: (data.totalCount as number) ?? 0,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/secrets");
      const data = await res.json();
      if (res.ok && data.ok) {
        applyPayload(data);
      } else {
        toast.error("Schlüssel konnten nicht geladen werden.");
      }
    } catch {
      toast.error("Netzwerkfehler beim Laden der Schlüssel.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCopy(entry: AdminSecretEntry) {
    if (!entry.value) return;

    try {
      await navigator.clipboard.writeText(entry.value);
      setCopiedId(entry.id);
      toast.success("Kopiert", { description: entry.label });
      window.setTimeout(() => {
        setCopiedId((current) => (current === entry.id ? null : current));
      }, 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen.");
    }
  }

  function handleStartEdit(entry: AdminSecretEntry) {
    setEditingId(entry.id);
    setDraft("");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function handleSave(entry: AdminSecretEntry) {
    if (!draft.trim()) return;

    setSavingId(entry.id);
    try {
      const res = await fetch("/api/admin/secrets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, value: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
        return;
      }

      applyPayload(data);
      setEditingId(null);
      setDraft("");
      toast.success("Gespeichert", { description: entry.label });
    } catch {
      toast.error("Netzwerkfehler beim Speichern.");
    } finally {
      setSavingId(null);
    }
  }

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((category) => groups[category]?.length),
    ...Object.keys(groups).filter((category) => !CATEGORY_ORDER.includes(category)),
  ];

  if (loading) {
    return (
      <div className={`${adminPanelClass} flex items-center gap-2 p-4 text-[#525866]`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Schlüssel laden…</span>
      </div>
    );
  }

  return (
    <div className={`${adminPanelClass} space-y-4 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="landing-body font-medium text-[#0E121B]">
            Schlüssel & APIs
          </h2>
          <p className="landing-caption mt-1 text-[#99A0AE]">
            Werte sind maskiert. Bearbeiten per Stift, Env-Werte nur in Vercel.
          </p>
        </div>
        <p className="landing-caption text-[#525866]">
          {stats.configured}/{stats.total} gesetzt
        </p>
      </div>

      <div className="space-y-4">
        {orderedCategories.map((category) => (
          <div key={category}>
            <p className="landing-caption mb-1 px-1 font-medium text-[#525866]">
              {category}
            </p>
            <ul className="overflow-hidden rounded border border-[#E1E4EA] bg-white divide-y divide-[#E1E4EA]">
              {groups[category].map((entry) => (
                <li key={entry.id}>
                  <SecretRow
                    entry={entry}
                    copiedId={copiedId}
                    editingId={editingId}
                    draft={draft}
                    saving={savingId === entry.id}
                    onCopy={handleCopy}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onDraftChange={setDraft}
                    onSave={handleSave}
                  />
                </li>
              ))}
              {category === "Twilio" ? (
                <li>
                  <AddIntegrationForm type="twilio" onAdded={load} />
                </li>
              ) : null}
              {category === "ElevenLabs" ? (
                <li>
                  <AddIntegrationForm type="elevenlabs" onAdded={load} />
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
