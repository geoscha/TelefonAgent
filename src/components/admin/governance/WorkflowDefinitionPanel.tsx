"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Rocket } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  WorkflowAllowedTool,
  WorkflowDefinition,
  WorkflowKbSource,
  WorkflowStepType,
} from "@/lib/workflow-engine/types";

const ALL_TOOLS: WorkflowAllowedTool[] = [
  "get_workflow_context",
  "escalate",
  "lookup_customer",
  "check_availability",
  "book_appointment",
  "cancel_appointment",
  "find_appointments",
];

const ALL_KB: WorkflowKbSource[] = [
  "website",
  "craftsmen",
  "curated_faq",
  "governance_kb",
  "none",
];

const STEP_TYPES: WorkflowStepType[] = [
  "collect",
  "validate",
  "act",
  "branch",
  "escalate",
  "complete",
];

export function WorkflowDefinitionPanel({ workflowId }: { workflowId: string }) {
  const [loading, setLoading] = useState(true);
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testResults, setTestResults] = useState<
    Array<{ name: string; passed: boolean; errors: string[] }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/governance/workflows/${workflowId}/definition`);
      const json = await res.json();
      if (res.ok && json.ok) {
        setDefinition(json.definition?.definition ?? null);
        setCurrentVersion(json.definition?.currentVersion ?? 0);
        setEngineEnabled(Boolean(json.engineEnabled));
      }
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDefinition(next: WorkflowDefinition) {
    setDefinition(next);
    const res = await fetch(
      `/api/admin/governance/workflows/${workflowId}/definition`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: next }),
      }
    );
    const json = await res.json();
    if (!res.ok || !json.ok) {
      toast.error(json.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    toast.success("Engine-Definition gespeichert.");
  }

  async function runTests() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/admin/governance/workflows/${workflowId}/definition/test`,
        { method: "POST" }
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        setTestResults(json.results ?? []);
        toast.success(`${json.passed}/${json.total} Tests bestanden.`);
      } else {
        toast.error(json.error ?? "Tests fehlgeschlagen.");
      }
    } finally {
      setTesting(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const res = await fetch(
        `/api/admin/governance/workflows/${workflowId}/definition/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(`Workflow v${json.version.versionNumber} veröffentlicht.`);
        await load();
      } else {
        toast.error(json.error ?? "Publish fehlgeschlagen.", {
          description: json.details?.join("\n"),
        });
      }
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className={`${adminPanelClass} flex items-center gap-2 p-4 text-[#525866]`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Engine-Definition laden…
      </div>
    );
  }

  if (!definition) return null;

  return (
    <div className={`${adminPanelClass} space-y-4 border-t-4 border-[#335cff]/30 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#335cff]">
            Workflow Execution Engine
          </p>
          <p className="mt-1 text-sm text-[#525866]">
            Strukturierte Definition · Version {currentVersion || "Draft"} · Flag:{" "}
            {engineEnabled ? "WORKFLOW_ENGINE_ENABLED=true" : "aus (Legacy-Prompt)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={runTests} disabled={testing}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Tests
          </Button>
          <Button type="button" size="sm" onClick={publish} disabled={publishing}>
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Publish Workflow
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={definition.strictMode}
          onCheckedChange={(checked) =>
            void saveDefinition({ ...definition, strictMode: checked })
          }
        />
        <Label className="landing-caption">Strikter Modus (Rechtsauskunft / Hard Guards)</Label>
      </div>

      <div>
        <Label className="landing-caption">Abschluss-Kriterium</Label>
        <textarea
          className="mt-1 w-full rounded-md border border-[#E1E4EA] p-2 text-sm"
          rows={2}
          value={definition.completionCriteria}
          onChange={(e) => setDefinition({ ...definition, completionCriteria: e.target.value })}
          onBlur={() => void saveDefinition(definition)}
        />
      </div>

      <div>
        <Label className="landing-caption">Erlaubte Tools</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_TOOLS.map((tool) => {
            const active = definition.allowedTools.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${
                  active
                    ? "bg-[#335cff]/10 text-[#335cff]"
                    : "bg-[#F5F7FA] text-[#99A0AE]"
                }`}
                onClick={() => {
                  const allowedTools = active
                    ? definition.allowedTools.filter((t) => t !== tool)
                    : [...definition.allowedTools, tool];
                  void saveDefinition({ ...definition, allowedTools });
                }}
              >
                {tool}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="landing-caption">KB-Quellen</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_KB.map((source) => {
            const active = definition.kbSources.includes(source);
            return (
              <button
                key={source}
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-[#F5F7FA] text-[#99A0AE]"
                }`}
                onClick={() => {
                  const kbSources = active
                    ? definition.kbSources.filter((s) => s !== source)
                    : [...definition.kbSources, source];
                  void saveDefinition({ ...definition, kbSources });
                }}
              >
                {source}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="landing-caption">Steps ({definition.steps.length})</Label>
        <div className="mt-2 space-y-2">
          {definition.steps.map((step, index) => (
            <div
              key={step.id}
              className="rounded-md border border-[#E1E4EA] bg-[#FAFBFC] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[#0E121B]">
                  {index + 1}. {step.label}
                </span>
                <select
                  className="rounded border border-[#E1E4EA] px-2 py-0.5 text-xs"
                  value={step.type}
                  onChange={(e) => {
                    const steps = [...definition.steps];
                    steps[index] = {
                      ...step,
                      type: e.target.value as WorkflowStepType,
                    };
                    void saveDefinition({ ...definition, steps });
                  }}
                >
                  {STEP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              {step.instructions ? (
                <p className="mt-1 text-xs text-[#525866]">{step.instructions}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {testResults.length > 0 ? (
        <div className="space-y-1">
          <Label className="landing-caption">Test-Ergebnisse</Label>
          {testResults.map((result) => (
            <div
              key={result.name}
              className={`rounded px-2 py-1 text-xs ${
                result.passed
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {result.passed ? "✓" : "✗"} {result.name}
              {result.errors.length > 0 ? `: ${result.errors.join("; ")}` : ""}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
