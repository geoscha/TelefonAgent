"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { landingInputClass } from "@/components/landing/landing-buttons";
import {
  DEMO_VOICE_PRESETS,
  type DemoVoicePresetId,
} from "@/lib/demo/voices";
import { cn } from "@/lib/utils";

interface DemoAgentConfigState {
  voicePreset: DemoVoicePresetId;
  greeting: string | null;
  context: string | null;
  defaultGreetingDe: string;
  defaultGreetingCh: string;
}

export function AdminDemoAgentSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DemoAgentConfigState | null>(null);
  const [voicePreset, setVoicePreset] = useState<DemoVoicePresetId>("female-de");
  const [greeting, setGreeting] = useState("");
  const [context, setContext] = useState("");

  useEffect(() => {
    fetch("/api/admin/demo-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.agent) {
          const agent = data.agent as DemoAgentConfigState;
          setConfig(agent);
          setVoicePreset(agent.voicePreset);
          setGreeting(agent.greeting ?? "");
          setContext(agent.context ?? "");
        }
      })
      .catch(() => toast.error("Demo-Agent konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/demo-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voicePreset,
          greeting: greeting.trim() || null,
          context: context.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.agent) {
        const agent = data.agent as DemoAgentConfigState;
        setConfig(agent);
        toast.success("Demo-Agent gespeichert.");
      } else {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={`${adminPanelClass} flex items-center gap-2 p-4 text-[#525866]`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Demo-Agent laden…</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className={`${adminPanelClass} space-y-4 p-4`}>
      <div>
        <h2 className="landing-body font-medium text-[#0E121B]">Demo-Agent</h2>
        <p className="landing-caption mt-1 text-[#99A0AE]">
          Stimme und Kontext für Landing-Demo und Live-Anrufe. Standard ist der
          Cura Agent — er fragt zuerst nach Fragen zu Cura und beantwortet sie.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="landing-caption">Stimme</Label>
        <div className="flex flex-wrap gap-2">
          {DEMO_VOICE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setVoicePreset(preset.id)}
              className={cn(
                "landing-radius-sm landing-caption border px-3 py-1.5 transition-colors",
                voicePreset === preset.id
                  ? "border-[#0E121B] bg-[#0E121B] text-white"
                  : "border-[#E1E4EA] bg-white text-[#0E121B] hover:bg-[#F5F7FA]"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="demo-greeting" className="landing-caption">
          Begrüssung (optional)
        </Label>
        <textarea
          id="demo-greeting"
          rows={3}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder={config?.defaultGreetingDe}
          className={cn(landingInputClass, "min-h-[72px] resize-y")}
        />
        <p className="landing-caption text-[#99A0AE]">
          Leer lassen für Standard: «Haben Sie Fragen zu unserem KI-Telefonagenten?»
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="demo-context" className="landing-caption">
          Zusätzlicher Kontext
        </Label>
        <textarea
          id="demo-context"
          rows={6}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ergänzende Infos zu Angebot, Preisen, Zielgruppe … (wird dem System-Prompt hinzugefügt)"
          className={cn(landingInputClass, "min-h-[120px] resize-y font-mono text-[12px]")}
        />
        <p className="landing-caption text-[#99A0AE]">
          Basiswissen zu Pricing und Funktionen ist bereits eingebaut. Hier können
          Sie z. B. Aktionen oder neue Pakete ergänzen.
        </p>
      </div>

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "…" : "Speichern"}
      </Button>
    </form>
  );
}
