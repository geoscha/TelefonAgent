"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { AdminDemoAgentSection } from "@/components/admin/AdminDemoAgentSection";
import { AdminSecretsSection } from "@/components/admin/AdminSecretsSection";
import { AdminTokenPacksSection } from "@/components/admin/AdminTokenPacksSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { landingInputClass } from "@/components/landing/landing-buttons";

export default function AdminSettingsPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((config) => {
        if (config.ok && config.username) setUsername(config.username);
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
        toast.success("Gespeichert.");
        setCode("");
      } else {
        toast.error(data.error ?? "Fehlgeschlagen.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#525866]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Laden…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <AdminSecretsSection />

      <AdminDemoAgentSection />

      <AdminTokenPacksSection />

      <form
        onSubmit={handleSave}
        className={`${adminPanelClass} space-y-3 p-4`}
      >
        <div>
          <h2 className="landing-body font-medium text-[#0E121B]">
            Admin-Zugang
          </h2>
          <p className="landing-caption mt-1 text-[#99A0AE]">
            Benutzername und Zugangscode für das Admin-Panel.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-username" className="landing-caption">
            Benutzername
          </Label>
          <Input
            id="admin-username"
            className={landingInputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-code-new" className="landing-caption">
            Neuer Code
          </Label>
          <Input
            id="admin-code-new"
            type="password"
            className={landingInputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Min. 4 Zeichen"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "…" : "Speichern"}
        </Button>
      </form>
    </div>
  );
}
