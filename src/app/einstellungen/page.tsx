"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  forwardingDeactivateCode,
  forwardingDeactivateHint,
  type ForwardingType,
} from "@/lib/phone/forwarding-codes";
import type { OnboardingPhase } from "@/lib/onboarding-types";
import type { CallQuotaView } from "@/lib/billing/quota-display";
import { FREE_CALL_SECONDS_LIMIT, quotaRemainingHighlight } from "@/lib/billing/quota-display";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";

type BillingPlan = "free" | "pro";
type BillingInterval = "monthly" | "yearly";

interface Profile {
  name: string;
  email: string;
  plan: BillingPlan;
  billingInterval?: BillingInterval;
  callQuota?: CallQuotaView;
}

const freeFeatures = [
  `${FREE_CALL_SECONDS_LIMIT} Sekunden Telefonate (Gesamt)`,
  "KI-Telefonagent",
  "Anruf-Transkripte & Zusammenfassungen",
];

const proFeatures = [
  "1 Stunde Telefonate pro Monat",
  "Kalender-Integration & Terminbuchung",
  "Erweiterte Auswertungen",
  "Priorisierter Support",
];

export default function ProfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [upgrading, setUpgrading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMessages, setSupportMessages] = useState<
    { id: string; message: string; createdAt: string }[]
  >([]);
  const [supportText, setSupportText] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const supportScrollRef = useRef<HTMLDivElement>(null);
  const [curaNumber, setCuraNumber] = useState<string | null>(null);
  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase | null>(null);

  const profileLoaded = useRef(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        setName(p.name ?? "");
        setEmail(p.email ?? "");
        if (p.billingInterval) setInterval(p.billingInterval);
        profileLoaded.current = true;
      })
      .catch(() => toast.error("Profil konnte nicht geladen werden."));

    fetch("/api/phone/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        const number =
          data.capabilities?.forwardingNumber ??
          data.settings?.curaForwardingNumber ??
          null;
        if (typeof number === "string" && number.trim()) {
          setCuraNumber(number.trim());
        }
        if (data.settings?.forwardingType === "alle") {
          setForwardingType("alle");
        }
        if (data.phase) setOnboardingPhase(data.phase as OnboardingPhase);
      })
      .catch(() => {});
  }, []);

  async function saveName() {
    if (!profileLoaded.current || !profile) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setName(profile.name ?? "");
      return;
    }
    if (trimmed === profile.name) return;

    setSavingName(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      const p = (await res.json()) as Profile;
      setProfile(p);
      setName(p.name ?? trimmed);
      router.refresh();
    } catch {
      toast.error("Name konnte nicht gespeichert werden.");
      setName(profile.name ?? "");
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    if (!currentPassword) {
      toast.error("Bitte Ihr aktuelles Passwort eingeben.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = createClient();
      const loginEmail = profile?.email ?? email;
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: currentPassword,
      });
      if (verifyError) {
        toast.error("Aktuelles Passwort ist nicht korrekt.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        toast.error("Passwort konnte nicht geändert werden.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Passwort geändert.");
    } catch {
      toast.error("Passwort konnte nicht geändert werden.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json().catch(() => ({}))) as Profile & {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok !== false) {
        setProfile(data);
        toast.success("Willkommen bei Cura Pro – Ihr Plan ist aktiv.");
        router.refresh();
        return;
      }
      toast.error(data.error ?? "Upgrade fehlgeschlagen.");
    } catch {
      toast.error("Upgrade fehlgeschlagen.");
    } finally {
      setUpgrading(false);
    }
  }

  async function loadSupportMessages() {
    setSupportLoading(true);
    try {
      const res = await fetch("/api/support");
      const data = await res.json();
      if (res.ok && data.ok) {
        setSupportMessages(data.messages ?? []);
      }
    } catch {
      toast.error("Support-Nachrichten konnten nicht geladen werden.");
    } finally {
      setSupportLoading(false);
    }
  }

  async function sendSupportMessage() {
    const trimmed = supportText.trim();
    if (!trimmed) return;

    setSupportSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSupportText("");
        setSupportMessages((prev) => [...prev, data.message]);
        toast.success("Nachricht gesendet.");
      } else {
        toast.error(data.error ?? "Senden fehlgeschlagen.");
      }
    } catch {
      toast.error("Senden fehlgeschlagen.");
    } finally {
      setSupportSending(false);
    }
  }

  function toggleSupport() {
    const next = !supportOpen;
    setSupportOpen(next);
    if (next && supportMessages.length === 0) {
      void loadSupportMessages();
    }
  }

  useEffect(() => {
    if (!supportOpen) return;
    supportScrollRef.current?.scrollTo({
      top: supportScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [supportMessages, supportOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Abmeldung fehlgeschlagen.");
      setLoggingOut(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Konto gelöscht.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Konto konnte nicht gelöscht werden.");
      setDeleting(false);
    }
  }

  const isPro = profile?.plan === "pro";
  const proPrice = interval === "yearly" ? "CHF 1’000" : "CHF 50";
  const proPer = interval === "yearly" ? "/ Jahr" : "/ Monat";
  const showForwardingRemovalHint =
    !!curaNumber &&
    (onboardingPhase === "weiterleitung" ||
      onboardingPhase === "agent" ||
      onboardingPhase === "fertig");
  const deactivateCode = forwardingDeactivateCode(forwardingType);
  const firstName =
    (profile?.name ?? name).trim().split(/\s+/)[0] ||
    profile?.name ||
    name ||
    "…";
  const quotaHighlight = profile?.callQuota
    ? quotaRemainingHighlight(profile.callQuota)
    : { value: "—", suffix: "Min. frei" };

  return (
    <div className="space-y-section pb-4">
      <WelcomeBanner
        name={firstName}
        highlight={quotaHighlight.value}
        highlightSuffix={quotaHighlight.suffix}
      />

      <div className="space-y-3">
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          placeholder="Name"
          autoComplete="name"
          disabled={savingName}
        />
        <Input
          id="email"
          type="email"
          value={email}
          readOnly
          placeholder="E-Mail"
          tabIndex={-1}
          className="cursor-default bg-bg/60 text-text-muted"
        />
      </div>

      <div className="space-y-3 border-t border-stroke pt-8">
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Aktuelles Passwort"
          autoComplete="current-password"
        />
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Neues Passwort"
          autoComplete="new-password"
        />
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Passwort bestätigen"
          autoComplete="new-password"
        />
        <Button
          onClick={savePassword}
          disabled={savingPassword || !profile}
          variant="outline"
        >
          {savingPassword ? "Speichern…" : "Passwort ändern"}
        </Button>
      </div>

      <section id="pricing" className="scroll-mt-8 space-y-6 border-t border-stroke pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="inline-flex items-center rounded-full border border-stroke bg-surface p-1 text-[13px] font-medium">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors",
                interval === "monthly"
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text"
              )}
            >
              Monatlich
            </button>
            <button
              type="button"
              onClick={() => setInterval("yearly")}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors",
                interval === "yearly"
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text"
              )}
            >
              Jährlich
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]",
                  interval === "yearly"
                    ? "bg-white/20 text-white"
                    : "bg-accent/10 text-accent"
                )}
              >
                −17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Free */}
          <div
            className={cn(
              "relative flex flex-col rounded-card border bg-surface p-7",
              !isPro ? "border-accent shadow-[0_8px_32px_rgba(26,82,122,0.12)]" : "border-stroke"
            )}
          >
            {!isPro && (
              <span className="absolute right-6 top-6 rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent">
                Aktueller Plan
              </span>
            )}
            <p className="text-[15px] font-semibold text-navy">Gratis</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-sans text-[40px] font-semibold leading-none text-navy">
                CHF 0
              </span>
              <span className="text-text-muted">/ Monat</span>
            </div>
            <ul className="mt-6 space-y-2">
              {freeFeatures.map((f) => (
                <li key={f} className="text-[15px] text-text">
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <Button variant="outline" className="w-full" disabled>
                {isPro ? "Auf Gratis wechseln" : "Aktueller Plan"}
              </Button>
            </div>
          </div>

          {/* Pro */}
          <div
            className={cn(
              "relative flex flex-col overflow-hidden rounded-card border bg-navy p-7 text-white",
              isPro ? "border-accent" : "border-navy"
            )}
          >
            {isPro && (
              <span className="absolute right-6 top-6 rounded-full bg-accent px-2.5 py-1 text-[12px] font-medium text-white">
                Aktueller Plan
              </span>
            )}
            <p className="text-[15px] font-semibold">Cura Pro</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-sans text-[40px] font-semibold leading-none">
                {proPrice}
              </span>
              <span className="text-white/70">{proPer}</span>
            </div>
            <ul className="mt-6 space-y-2">
              {proFeatures.map((f) => (
                <li key={f} className="text-[15px] text-white/90">
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <Button
                onClick={upgrade}
                disabled={upgrading || isPro}
                className="w-full"
              >
                {upgrading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPro ? "Aktiv" : "Jetzt upgraden"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-stroke pt-8">
        <button
          type="button"
          onClick={toggleSupport}
          className="text-body text-accent underline-offset-4 hover:underline"
        >
          Support kontaktieren
        </button>

        {supportOpen && (
          <div className="mt-4 space-y-3 rounded-card border border-stroke bg-surface p-4">
            <div
              ref={supportScrollRef}
              className="flex max-h-[220px] min-h-[80px] flex-col gap-2 overflow-y-auto"
            >
              {supportLoading ? (
                <p className="text-caption text-text-muted">Laden…</p>
              ) : supportMessages.length === 0 ? (
                <p className="text-caption text-text-muted">
                  Schreiben Sie uns — wir melden uns bei Ihnen.
                </p>
              ) : (
                supportMessages.map((msg) => (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-[14px] bg-accent/10 px-3 py-2 text-[14px] leading-relaxed text-navy">
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendSupportMessage();
              }}
              className="flex gap-2"
            >
              <Input
                value={supportText}
                onChange={(e) => setSupportText(e.target.value)}
                placeholder="Ihre Nachricht…"
                disabled={supportSending}
              />
              <Button
                type="submit"
                disabled={supportSending || !supportText.trim()}
              >
                {supportSending ? "…" : "Senden"}
              </Button>
            </form>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="mt-6 block text-body text-accent underline-offset-4 hover:underline disabled:opacity-50"
        >
          {loggingOut ? "Abmelden…" : "Abmelden"}
        </button>

        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="mt-4 block text-body text-red-600 hover:text-red-700"
        >
          Konto löschen
        </button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konto wirklich löschen?</DialogTitle>
            <DialogDescription>
              Alle Anrufe, Einstellungen und Integrationen werden dauerhaft
              entfernt. Dieser Schritt kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          {showForwardingRemovalHint && (
            <div className="rounded-btn border border-stroke bg-bg/50 p-3 text-caption text-text">
              <p className="font-medium text-navy">Weiterleitung entfernen</p>
              <p className="mt-2 text-text-muted">
                Falls Sie Anrufe auf{" "}
                <span className="font-mono text-text">{curaNumber}</span>{" "}
                weitergeleitet haben, deaktivieren Sie die Weiterleitung auf
                Ihrer Geschäftsnummer — sonst gehen Anrufe weiter dorthin.
              </p>
              <p className="mt-2">
                {forwardingDeactivateHint(forwardingType)}{" "}
                <span className="font-mono font-medium text-navy">
                  {deactivateCode}
                </span>
              </p>
              <p className="mt-1 text-text-muted">
                Telefonanlage: Weiterleitung auf die Cura-Nummer löschen.
              </p>
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAccount}
              disabled={deleting}
            >
              {deleting ? "Löschen…" : "Endgültig löschen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
