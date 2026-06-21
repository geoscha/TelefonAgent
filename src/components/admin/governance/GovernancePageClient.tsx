"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { GovernanceWorkflowEditor } from "@/components/admin/governance/GovernanceWorkflowEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { landingInputClass } from "@/components/landing/landing-buttons";
import { emptyWorkflowInput } from "@/lib/governance/defaults";
import type {
  GovernanceDraftConfig,
  GovernancePreview,
  GovernanceVersion,
  GovernanceWorkflow,
  GovernanceWorkflowInput,
} from "@/lib/governance/types";
import { cn } from "@/lib/utils";

function TextArea({
  id,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        landingInputClass,
        "min-h-[80px] w-full resize-y py-2 leading-relaxed"
      )}
    />
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="landing-body font-medium text-[#0E121B]">{title}</h2>
      <p className="landing-caption mt-1 text-[#99A0AE]">{description}</p>
    </div>
  );
}

export function GovernancePageClient({
  initialConfig,
  initialWorkflows,
  currentVersion,
  onReload,
}: {
  initialConfig: GovernanceDraftConfig;
  initialWorkflows: GovernanceWorkflow[];
  currentVersion: number;
  onReload: () => Promise<void>;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [version, setVersion] = useState(currentVersion);
  const [savingConfig, setSavingConfig] = useState(false);
  const [preview, setPreview] = useState<GovernancePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishNotes, setPublishNotes] = useState("");
  const [versions, setVersions] = useState<GovernanceVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    workflows[0]?.id ?? null
  );
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);

  const selectedWorkflow =
    workflows.find((w) => w.id === selectedWorkflowId) ?? null;

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Speichern fehlgeschlagen.");
      }
      setConfig(data.config);
      toast.success("Konfiguration gespeichert.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen."
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveWorkflow(input: GovernanceWorkflowInput, id?: string) {
    const url = id
      ? `/api/admin/governance/workflows/${id}`
      : "/api/admin/governance/workflows";
    const res = await fetch(url, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Speichern fehlgeschlagen.");
    }
    setWorkflows((prev) => {
      if (id) {
        return prev.map((w) => (w.id === id ? data.workflow : w));
      }
      return [...prev, data.workflow];
    });
    setSelectedWorkflowId(data.workflow.id);
    setCreatingWorkflow(false);
    toast.success("Workflow gespeichert.");
  }

  async function deleteWorkflow(id: string) {
    const res = await fetch(`/api/admin/governance/workflows/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Löschen fehlgeschlagen.");
    }
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setSelectedWorkflowId((current) =>
      current === id ? (workflows.find((w) => w.id !== id)?.id ?? null) : current
    );
    toast.success("Workflow gelöscht.");
  }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/admin/governance/preview");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Vorschau fehlgeschlagen.");
      }
      setPreview(data.preview);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Vorschau fehlgeschlagen."
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const res = await fetch("/api/admin/governance/versions");
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Versionen laden fehlgeschlagen.");
      }
      setVersions(data.versions);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Versionen laden fehlgeschlagen."
      );
    } finally {
      setVersionsLoading(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/governance/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: publishNotes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Veröffentlichen fehlgeschlagen.");
      }
      setVersion(data.version);
      setPublishNotes("");
      setPreview(null);
      await onReload();
      toast.success(`Version ${data.version} veröffentlicht.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Veröffentlichen fehlgeschlagen."
      );
    } finally {
      setPublishing(false);
    }
  }

  async function rollback(versionNumber: number) {
    const res = await fetch("/api/admin/governance/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionNumber }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Rollback fehlgeschlagen.");
    }
    setVersion(versionNumber);
    await onReload();
    toast.success(`Auf Version ${versionNumber} zurückgesetzt.`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="landing-h3 text-[#0E121B]">Agent Governance</h1>
          <p className="landing-caption mt-1 max-w-2xl text-[#99A0AE]">
            Zentrale Regelbasis für Anruf- und Nachrichtenagenten. Änderungen
            werden beim Veröffentlichen vorkompiliert und greifen im nächsten
            Gespräch oder Entwurf.
          </p>
        </div>
        <div className="landing-radius border border-[#E1E4EA] bg-[#F5F7FA] px-3 py-2 text-right">
          <p className="landing-caption text-[#525866]">Aktive Version</p>
          <p className="landing-body font-medium tabular-nums text-[#0E121B]">
            {version > 0 ? `v${version}` : "Noch nicht veröffentlicht"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-[#F5F7FA] p-1">
          <TabsTrigger value="global">Globale Regeln</TabsTrigger>
          <TabsTrigger value="tone">Ton & Vokabular</TabsTrigger>
          <TabsTrigger value="channels">Kanal-Einstellungen</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="publish">Publish & Versionen</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-3">
          <div className={`${adminPanelClass} space-y-4 p-4`}>
            <SectionHeader
              title="Grounding & Anti-Halluzination"
              description="Was Agenten behaupten dürfen und wie sie bei Unbekanntem reagieren."
            />
            <div className="space-y-2">
              <Label htmlFor="grounding" className="landing-caption">
                Grounding
              </Label>
              <TextArea
                id="grounding"
                value={config.globalRules.grounding}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    globalRules: { ...config.globalRules, grounding: value },
                  })
                }
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback" className="landing-caption">
                Fallback bei Unbekanntem
              </Label>
              <TextArea
                id="fallback"
                value={config.globalRules.fallbackBehavior}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    globalRules: {
                      ...config.globalRules,
                      fallbackBehavior: value,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="privacy" className="landing-caption">
                Datenschutz
              </Label>
              <TextArea
                id="privacy"
                value={config.globalRules.privacy}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    globalRules: { ...config.globalRules, privacy: value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="escalation" className="landing-caption">
                Eskalation (global)
              </Label>
              <TextArea
                id="escalation"
                value={config.globalRules.escalationGlobal}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    globalRules: {
                      ...config.globalRules,
                      escalationGlobal: value,
                    },
                  })
                }
              />
            </div>
            <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Speichern
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="tone" className="space-y-3">
          <div className={`${adminPanelClass} space-y-4 p-4`}>
            <SectionHeader
              title="Ton & Stil"
              description="Prinzipien und Beispiele — keine starren Skripte."
            />
            <div className="space-y-2">
              <Label className="landing-caption">Ton-Prinzipien</Label>
              <TextArea
                id="tone-principles"
                value={config.toneVocabulary.tonePrinciples}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    toneVocabulary: {
                      ...config.toneVocabulary,
                      tonePrinciples: value,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="landing-caption">Ton-Beispiele (je Zeile)</Label>
              <TextArea
                id="tone-examples"
                rows={5}
                value={config.toneVocabulary.toneExamples.join("\n")}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    toneVocabulary: {
                      ...config.toneVocabulary,
                      toneExamples: value.split("\n"),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="landing-caption">
                Zu vermeidende Formulierungen (je Zeile)
              </Label>
              <TextArea
                id="forbidden"
                rows={4}
                value={config.toneVocabulary.forbiddenPhrases.join("\n")}
                onChange={(value) =>
                  setConfig({
                    ...config,
                    toneVocabulary: {
                      ...config.toneVocabulary,
                      forbiddenPhrases: value.split("\n"),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-3">
              <Label className="landing-caption">Glossar</Label>
              {config.toneVocabulary.glossary.map((entry, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[#E1E4EA] p-3 sm:grid-cols-3"
                >
                  <Input
                    className={landingInputClass}
                    placeholder="Begriff"
                    value={entry.term}
                    onChange={(e) => {
                      const glossary = [...config.toneVocabulary.glossary];
                      glossary[index] = { ...entry, term: e.target.value };
                      setConfig({
                        ...config,
                        toneVocabulary: {
                          ...config.toneVocabulary,
                          glossary,
                        },
                      });
                    }}
                  />
                  <Input
                    className={landingInputClass}
                    placeholder="Bevorzugt"
                    value={entry.preferred}
                    onChange={(e) => {
                      const glossary = [...config.toneVocabulary.glossary];
                      glossary[index] = { ...entry, preferred: e.target.value };
                      setConfig({
                        ...config,
                        toneVocabulary: {
                          ...config.toneVocabulary,
                          glossary,
                        },
                      });
                    }}
                  />
                  <Input
                    className={landingInputClass}
                    placeholder="Vermeiden (kommagetrennt)"
                    value={entry.avoid.join(", ")}
                    onChange={(e) => {
                      const glossary = [...config.toneVocabulary.glossary];
                      glossary[index] = {
                        ...entry,
                        avoid: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      };
                      setConfig({
                        ...config,
                        toneVocabulary: {
                          ...config.toneVocabulary,
                          glossary,
                        },
                      });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfig({
                    ...config,
                    toneVocabulary: {
                      ...config.toneVocabulary,
                      glossary: [
                        ...config.toneVocabulary.glossary,
                        { term: "", preferred: "", avoid: [] },
                      ],
                    },
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Glossar-Eintrag
              </Button>
            </div>
            <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Speichern
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="channels" className="space-y-3">
          <div className={`${adminPanelClass} grid gap-4 p-4 md:grid-cols-2`}>
            <div className="space-y-3">
              <SectionHeader
                title="Anrufagent (Voice)"
                description="Live-Antwort, niedrige Latenz, Weiterleitung."
              />
              {(
                [
                  ["liveResponseHints", "Live-Antwort"],
                  ["speechStyle", "Sprechstil"],
                  ["transferRules", "Weiterleitung"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label className="landing-caption">{label}</Label>
                  <TextArea
                    id={`voice-${key}`}
                    value={config.channelSettings.voice[key]}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        channelSettings: {
                          ...config.channelSettings,
                          voice: {
                            ...config.channelSettings.voice,
                            [key]: value,
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <SectionHeader
                title="Nachrichtenagent"
                description="Vorschlags-Modus mit Human-in-the-Loop."
              />
              {(
                [
                  ["suggestionMode", "Vorschlags-Modus"],
                  ["uncertaintyHints", "Unsicherheit"],
                  ["draftStyle", "Entwurfsstil"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label className="landing-caption">{label}</Label>
                  <TextArea
                    id={`message-${key}`}
                    value={config.channelSettings.message[key]}
                    onChange={(value) =>
                      setConfig({
                        ...config,
                        channelSettings: {
                          ...config.channelSettings,
                          message: {
                            ...config.channelSettings.message,
                            [key]: value,
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="md:col-span-2">
              <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Speichern
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                onClick={() => {
                  setSelectedWorkflowId(workflow.id);
                  setCreatingWorkflow(false);
                }}
                className={cn(
                  "landing-radius-sm border px-3 py-2 landing-caption transition-colors",
                  selectedWorkflowId === workflow.id && !creatingWorkflow
                    ? "border-[#335cff] bg-[#335cff]/5 text-[#0E121B]"
                    : "border-[#E1E4EA] text-[#525866] hover:text-[#0E121B]"
                )}
              >
                {workflow.name}
                {!workflow.enabledGlobally && (
                  <span className="ml-1 text-[#99A0AE]">(inaktiv)</span>
                )}
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCreatingWorkflow(true);
                setSelectedWorkflowId(null);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Neuer Workflow
            </Button>
          </div>

          {(selectedWorkflow || creatingWorkflow) && (
            <GovernanceWorkflowEditor
              workflow={
                creatingWorkflow
                  ? emptyWorkflowInput()
                  : {
                      slug: selectedWorkflow!.slug,
                      name: selectedWorkflow!.name,
                      description: selectedWorkflow!.description,
                      triggerIntent: selectedWorkflow!.triggerIntent,
                      goals: selectedWorkflow!.goals,
                      requiredSlots: selectedWorkflow!.requiredSlots,
                      optionalSlots: selectedWorkflow!.optionalSlots,
                      businessRules: selectedWorkflow!.businessRules,
                      voiceVariant: selectedWorkflow!.voiceVariant,
                      messageVariant: selectedWorkflow!.messageVariant,
                      fallback: selectedWorkflow!.fallback,
                      outputSchema: selectedWorkflow!.outputSchema,
                      examples: selectedWorkflow!.examples,
                      enabledGlobally: selectedWorkflow!.enabledGlobally,
                      sortOrder: selectedWorkflow!.sortOrder,
                    }
              }
              isNew={creatingWorkflow}
              onSave={(input) =>
                saveWorkflow(input, creatingWorkflow ? undefined : selectedWorkflow!.id)
              }
              onDelete={
                creatingWorkflow
                  ? undefined
                  : () => deleteWorkflow(selectedWorkflow!.id)
              }
            />
          )}
        </TabsContent>

        <TabsContent value="publish" className="space-y-3">
          <div className={`${adminPanelClass} space-y-4 p-4`}>
            <SectionHeader
              title="Veröffentlichen"
              description="Kompiliert globale Regeln und aktive Workflows kanalweise. Validierung vor Publish."
            />
            <div className="space-y-2">
              <Label htmlFor="publish-notes" className="landing-caption">
                Versionsnotiz (optional)
              </Label>
              <Input
                id="publish-notes"
                className={landingInputClass}
                value={publishNotes}
                onChange={(e) => setPublishNotes(e.target.value)}
                placeholder="z. B. Schadensfall-Workflow erweitert"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadPreview}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCompare className="h-3.5 w-3.5" />
                )}
                Vorschau & Diff
              </Button>
              <Button size="sm" onClick={publish} disabled={publishing}>
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Veröffentlichen
              </Button>
            </div>

            {preview && (
              <div className="space-y-3 rounded-lg border border-[#E1E4EA] bg-[#F5F7FA] p-3">
                {preview.validationIssues.length > 0 ? (
                  <div className="flex items-start gap-2 text-[#B42318]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <ul className="landing-caption space-y-1">
                      {preview.validationIssues.map((issue) => (
                        <li key={issue.path}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#027A48]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="landing-caption">
                      Validierung bestanden — bereit zum Veröffentlichen.
                    </span>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="landing-caption text-[#525866]">
                    Voice global:{" "}
                    {preview.diff.globalVoiceChanged ? "geändert" : "unverändert"}
                  </p>
                  <p className="landing-caption text-[#525866]">
                    Message global:{" "}
                    {preview.diff.globalMessageChanged
                      ? "geändert"
                      : "unverändert"}
                  </p>
                </div>
                {preview.diff.workflowChanges.length > 0 && (
                  <ul className="landing-caption space-y-1 text-[#525866]">
                    {preview.diff.workflowChanges.map((change) => (
                      <li key={change.slug}>
                        {change.isRemoved
                          ? `− ${change.slug} (entfernt)`
                          : change.isNew
                            ? `+ ${change.slug} (neu)`
                            : `~ ${change.slug} (voice: ${change.voiceChanged ? "ja" : "nein"}, message: ${change.messageChanged ? "ja" : "nein"})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className={`${adminPanelClass} space-y-3 p-4`}>
            <div className="flex items-center justify-between gap-2">
              <SectionHeader
                title="Versionen"
                description="Veröffentlichte Snapshots mit Rollback."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadVersions}
                disabled={versionsLoading}
              >
                {versionsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Laden
              </Button>
            </div>
            {versions.length === 0 ? (
              <p className="landing-caption text-[#99A0AE]">
                Noch keine Versionen geladen.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E1E4EA] px-3 py-2"
                  >
                    <div>
                      <p className="landing-body font-medium text-[#0E121B]">
                        v{v.versionNumber}
                        {v.versionNumber === version && (
                          <span className="ml-2 text-[#335cff]">(aktiv)</span>
                        )}
                      </p>
                      <p className="landing-caption text-[#99A0AE]">
                        {new Date(v.publishedAt).toLocaleString("de-CH")}
                        {v.notes ? ` — ${v.notes}` : ""}
                      </p>
                    </div>
                    {v.versionNumber !== version && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => rollback(v.versionNumber)}
                      >
                        Rollback
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
