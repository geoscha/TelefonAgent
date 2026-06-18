"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IntegrationsPublic {
  twilioConfigured: boolean;
  elevenLabsConfigured: boolean;
  twilioAccountSidMasked: string;
  elevenLabsKeyMasked: string;
  usdToChfRate: number;
  elevenLabsFromEnv: boolean;
}

export default function AdminSettingsPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFinance, setSavingFinance] = useState(false);

  const [integrations, setIntegrations] = useState<IntegrationsPublic | null>(
    null
  );
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [usdToChf, setUsdToChf] = useState("0.88");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/config").then((r) => r.json()),
      fetch("/api/admin/finance-integrations").then((r) => r.json()),
    ])
      .then(([config, finance]) => {
        if (config.ok && config.username) setUsername(config.username);
        if (finance.ok && finance.integrations) {
          setIntegrations(finance.integrations as IntegrationsPublic);
          setUsdToChf(String(finance.integrations.usdToChfRate ?? 0.88));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Admin-Zugang aktualisiert.");
        setCode("");
      } else {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveFinance(e: React.FormEvent) {
    e.preventDefault();
    setSavingFinance(true);
    try {
      const body: Record<string, unknown> = {
        usdToChfRate: parseFloat(usdToChf),
      };
      if (twilioSid.trim()) body.twilioAccountSid = twilioSid.trim();
      if (twilioToken.trim()) body.twilioAuthToken = twilioToken.trim();
      if (elevenLabsKey.trim()) body.elevenLabsApiKey = elevenLabsKey.trim();

      const res = await fetch("/api/admin/finance-integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIntegrations(data.integrations as IntegrationsPublic);
        setTwilioSid("");
        setTwilioToken("");
        setElevenLabsKey("");
        toast.success("Finanz-APIs gespeichert.");
      } else {
        toast.error(data.error ?? "Speichern fehlgeschlagen.");
      }
    } finally {
      setSavingFinance(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-10">
      <div>
        <h1>Einstellungen</h1>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      ) : (
        <>
          <form
            onSubmit={handleSave}
            className="space-y-4 rounded-card border border-stroke bg-surface p-6"
          >
            <p className="font-medium text-navy">Admin-Zugang</p>
            <div className="space-y-2">
              <Label htmlFor="admin-username">Benutzername</Label>
              <Input
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-code-new">Neuer Code</Label>
              <Input
                id="admin-code-new"
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Mindestens 4 Zeichen"
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </form>

          <form
            onSubmit={saveFinance}
            className="space-y-4 rounded-card border border-stroke bg-surface p-6"
          >
            <p className="font-medium text-navy">Finanz-APIs</p>
            {integrations && (
              <div className="space-y-1 text-caption text-text-muted">
                <p>
                  Twilio:{" "}
                  {integrations.twilioConfigured
                    ? integrations.twilioAccountSidMasked
                    : "nicht verbunden"}
                </p>
                <p>
                  ElevenLabs:{" "}
                  {integrations.elevenLabsConfigured
                    ? integrations.elevenLabsKeyMasked
                    : "nicht verbunden"}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="twilio-sid">Twilio Account SID</Label>
              <Input
                id="twilio-sid"
                className="font-mono text-caption"
                placeholder="AC…"
                value={twilioSid}
                onChange={(e) => setTwilioSid(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twilio-token">Twilio Auth Token</Label>
              <Input
                id="twilio-token"
                type="password"
                className="font-mono text-caption"
                placeholder="Neu eingeben zum Aktualisieren"
                value={twilioToken}
                onChange={(e) => setTwilioToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="el-key">ElevenLabs API Key</Label>
              <Input
                id="el-key"
                type="password"
                className="font-mono text-caption"
                placeholder={
                  integrations?.elevenLabsFromEnv
                    ? "Optional — sonst ELEVENLABS_API_KEY"
                    : "xi-…"
                }
                value={elevenLabsKey}
                onChange={(e) => setElevenLabsKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usd-chf">USD → CHF Kurs</Label>
              <Input
                id="usd-chf"
                type="number"
                step="0.01"
                min="0.01"
                value={usdToChf}
                onChange={(e) => setUsdToChf(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingFinance}>
              {savingFinance ? "Speichern…" : "APIs speichern"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
