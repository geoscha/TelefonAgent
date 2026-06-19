"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { adminPanelClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { landingInputClass } from "@/components/landing/landing-buttons";

interface TwilioAccount {
  id: string;
  label: string;
  accountSidMasked: string;
  isDefault: boolean;
}

interface ElevenLabsAccount {
  id: string;
  label: string;
  apiKeyMasked: string;
  isDefault: boolean;
  fromEnv?: boolean;
}

export function IntegrationProfilesSection() {
  const [loading, setLoading] = useState(true);
  const [twilio, setTwilio] = useState<TwilioAccount[]>([]);
  const [elevenlabs, setElevenlabs] = useState<ElevenLabsAccount[]>([]);
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [savingEl, setSavingEl] = useState(false);
  const [twilioLabel, setTwilioLabel] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [updateTwilioId, setUpdateTwilioId] = useState("");
  const [updateTwilioSid, setUpdateTwilioSid] = useState("");
  const [updateTwilioToken, setUpdateTwilioToken] = useState("");
  const [updatingTwilio, setUpdatingTwilio] = useState(false);
  const [elLabel, setElLabel] = useState("");
  const [elKey, setElKey] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/integration-profiles");
    const data = await res.json();
    if (res.ok && data.ok) {
      setTwilio(data.twilio ?? []);
      setElevenlabs(data.elevenlabs ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTwilio(e: React.FormEvent) {
    e.preventDefault();
    setSavingTwilio(true);
    try {
      const res = await fetch("/api/admin/integration-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "twilio",
          label: twilioLabel.trim(),
          accountSid: twilioSid.trim(),
          authToken: twilioToken.trim(),
          isDefault: twilio.length === 0,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Twilio-Konto gespeichert.");
        setTwilioLabel("");
        setTwilioSid("");
        setTwilioToken("");
        await load();
      } else {
        toast.error(data.error ?? "Fehlgeschlagen.");
      }
    } finally {
      setSavingTwilio(false);
    }
  }

  async function refreshTwilioCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!updateTwilioId) {
      toast.error("Bitte ein Konto auswählen.");
      return;
    }
    setUpdatingTwilio(true);
    try {
      const res = await fetch("/api/admin/integration-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "twilio",
          action: "update",
          id: updateTwilioId,
          accountSid: updateTwilioSid.trim(),
          authToken: updateTwilioToken.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Twilio-Zugangsdaten aktualisiert.");
        setUpdateTwilioSid("");
        setUpdateTwilioToken("");
        await load();
      } else {
        toast.error(data.error ?? "Aktualisierung fehlgeschlagen.");
      }
    } finally {
      setUpdatingTwilio(false);
    }
  }

  async function addElevenLabs(e: React.FormEvent) {
    e.preventDefault();
    setSavingEl(true);
    try {
      const res = await fetch("/api/admin/integration-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "elevenlabs",
          label: elLabel,
          apiKey: elKey,
          isDefault: elevenlabs.filter((a) => !a.fromEnv).length === 0,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("ElevenLabs-Konto gespeichert.");
        setElLabel("");
        setElKey("");
        await load();
      } else {
        toast.error(data.error ?? "Fehlgeschlagen.");
      }
    } finally {
      setSavingEl(false);
    }
  }

  async function setDefault(type: "twilio" | "elevenlabs", id: string) {
    const res = await fetch("/api/admin/integration-profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, action: "set_default" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setTwilio(data.twilio ?? []);
      setElevenlabs(data.elevenlabs ?? []);
      toast.success("Standard gesetzt.");
    } else {
      toast.error(data.error ?? "Fehlgeschlagen.");
    }
  }

  async function remove(type: "twilio" | "elevenlabs", id: string) {
    const res = await fetch(
      `/api/admin/integration-profiles?type=${type}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      setTwilio(data.twilio ?? []);
      setElevenlabs(data.elevenlabs ?? []);
      toast.success("Gelöscht.");
    } else {
      toast.error(data.error ?? "Fehlgeschlagen.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#525866]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="landing-caption">Konten laden…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`${adminPanelClass} p-4 space-y-3`}>
        <p className="landing-caption text-[#525866]">Twilio-Konten</p>
        {twilio.length > 0 && (
          <ul className="divide-y divide-[#E1E4EA] border border-[#E1E4EA] landing-radius-sm">
            {twilio.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="landing-body text-[#0E121B]">{a.label}</p>
                  <p className="landing-caption font-mono text-[#99A0AE]">
                    {a.accountSidMasked}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!a.isDefault && (
                    <button
                      type="button"
                      onClick={() => void setDefault("twilio", a.id)}
                      className="landing-radius-sm p-1.5 text-[#525866] hover:bg-[#F5F7FA]"
                      title="Als Standard"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {a.isDefault && (
                    <span className="landing-caption text-[#335cff] px-1">
                      Standard
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove("twilio", a.id)}
                    className="landing-radius-sm p-1.5 text-[#525866] hover:bg-[#F5F7FA] hover:text-red-600"
                    title="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {twilio.length > 0 && (
          <form onSubmit={refreshTwilioCredentials} className="space-y-2 border-t border-[#E1E4EA] pt-3">
            <p className="landing-caption text-[#525866]">
              Zugangsdaten aktualisieren
            </p>
            <select
              className={`${landingInputClass} landing-caption min-h-9`}
              value={updateTwilioId}
              onChange={(e) => setUpdateTwilioId(e.target.value)}
              required
            >
              <option value="">Konto wählen…</option>
              {twilio.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <Input
              className={`${landingInputClass} font-mono`}
              placeholder="Account SID (AC…)"
              value={updateTwilioSid}
              onChange={(e) => setUpdateTwilioSid(e.target.value)}
              required
            />
            <Input
              type="password"
              className={`${landingInputClass} font-mono`}
              placeholder="Auth Token"
              value={updateTwilioToken}
              onChange={(e) => setUpdateTwilioToken(e.target.value)}
              required
            />
            <Button type="submit" size="sm" variant="outline" disabled={updatingTwilio}>
              {updatingTwilio ? "…" : "Aktualisieren"}
            </Button>
          </form>
        )}
        <form onSubmit={addTwilio} className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="twilio-label" className="landing-caption">
              Bezeichnung
            </Label>
            <Input
              id="twilio-label"
              className={landingInputClass}
              placeholder="z. B. Hauptkonto"
              value={twilioLabel}
              onChange={(e) => setTwilioLabel(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio-sid-new" className="landing-caption">
              Account SID
            </Label>
            <Input
              id="twilio-sid-new"
              className={`${landingInputClass} font-mono`}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={twilioSid}
              onChange={(e) => setTwilioSid(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio-token-new" className="landing-caption">
              Auth Token (Pflicht)
            </Label>
            <Input
              id="twilio-token-new"
              type="password"
              className={`${landingInputClass} font-mono`}
              placeholder="Auth Token aus Twilio Console"
              value={twilioToken}
              onChange={(e) => setTwilioToken(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={savingTwilio}>
            {savingTwilio ? (
              "…"
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Twilio hinzufügen
              </>
            )}
          </Button>
        </form>
      </div>

      <div className={`${adminPanelClass} p-4 space-y-3`}>
        <p className="landing-caption text-[#525866]">ElevenLabs-Konten</p>
        {elevenlabs.length > 0 && (
          <ul className="divide-y divide-[#E1E4EA] border border-[#E1E4EA] landing-radius-sm">
            {elevenlabs.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="landing-body text-[#0E121B]">{a.label}</p>
                  <p className="landing-caption font-mono text-[#99A0AE]">
                    {a.apiKeyMasked}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!a.isDefault && !a.fromEnv && (
                    <button
                      type="button"
                      onClick={() => void setDefault("elevenlabs", a.id)}
                      className="landing-radius-sm p-1.5 text-[#525866] hover:bg-[#F5F7FA]"
                      title="Als Standard"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {a.isDefault && (
                    <span className="landing-caption text-[#335cff] px-1">
                      Standard
                    </span>
                  )}
                  {!a.fromEnv && (
                    <button
                      type="button"
                      onClick={() => void remove("elevenlabs", a.id)}
                      className="landing-radius-sm p-1.5 text-[#525866] hover:bg-[#F5F7FA] hover:text-red-600"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addElevenLabs} className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="el-label" className="landing-caption">
              Bezeichnung
            </Label>
            <Input
              id="el-label"
              className={landingInputClass}
              placeholder="z. B. Produktion"
              value={elLabel}
              onChange={(e) => setElLabel(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="el-key-new" className="landing-caption">
              API Key
            </Label>
            <Input
              id="el-key-new"
              type="password"
              className={`${landingInputClass} font-mono`}
              placeholder="xi-…"
              value={elKey}
              onChange={(e) => setElKey(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={savingEl}>
            {savingEl ? (
              "…"
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" />
                ElevenLabs hinzufügen
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
