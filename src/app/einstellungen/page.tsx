"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Check,
  Sparkles,
  LifeBuoy,
  Trash2,
  Loader2,
  KeyRound,
  LogOut,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FREE_CALL_SECONDS_LIMIT } from "@/lib/billing/quota-display";
import { UsageRing } from "@/components/billing/UsageRing";

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
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [upgrading, setUpgrading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [curaNumber, setCuraNumber] = useState<string | null>(null);
  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        setName(p.name ?? "");
        setEmail(p.email ?? "");
        if (p.billingInterval) setInterval(p.billingInterval);
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

  async function saveAccount() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    setSavingAccount(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const p = (await res.json()) as Profile;
      setProfile(p);
      toast.success("Name gespeichert.");
      router.refresh();
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveEmail() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Bitte eine E-Mail-Adresse eingeben.");
      return;
    }
    if (profile && trimmed === profile.email) {
      toast.info("Die E-Mail-Adresse ist unverändert.");
      return;
    }
    setSavingEmail(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) {
        toast.error(
          error.message.includes("already")
            ? "Diese E-Mail-Adresse wird bereits verwendet."
            : "E-Mail konnte nicht geändert werden."
        );
        return;
      }

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error();

      const authEmail = data.user?.email ?? trimmed;
      const p = (await res.json()) as Profile;
      setProfile({ ...p, email: authEmail });
      setEmail(authEmail);

      if (authEmail !== trimmed) {
        toast.success("Bestätigungs-E-Mail gesendet.", {
          description:
            "Bitte bestätigen Sie die neue Adresse über den Link in Ihrem Postfach.",
        });
      } else {
        toast.success("E-Mail gespeichert.");
      }
      router.refresh();
    } catch {
      toast.error("E-Mail konnte nicht gespeichert werden.");
    } finally {
      setSavingEmail(false);
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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
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
      router.push("/login");
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

  return (
    <div className="space-y-12 pb-4">
      <div>
        <h1>Profil</h1>
        <p className="mt-1 text-text-muted">
          Verwalten Sie Ihr Konto und Ihren Plan.
        </p>
      </div>

      {profile?.callQuota && (
        <Card className="max-w-xl">
          <CardContent className="py-6">
            <UsageRing
              usedSeconds={profile.callQuota.usedSeconds}
              limitSeconds={profile.callQuota.limitSeconds}
              percentUsed={profile.callQuota.percentUsed}
              periodLabel={
                profile.callQuota.plan === "pro"
                  ? profile.callQuota.periodLabel
                  : "Gratis — einmalig"
              }
            />
            {profile.callQuota.resetsAt && profile.plan === "pro" && (
              <p className="mt-4 text-caption text-text-muted">
                Reset am{" "}
                {new Date(profile.callQuota.resetsAt).toLocaleDateString("de-CH")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Konto */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 stroke-[1.5] text-accent" />
            Kontoinformationen
          </CardTitle>
          <CardDescription>
            Ihr Name erscheint in der Begrüssung auf der Startseite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vor- und Nachname"
            />
          </div>
          <Button onClick={saveAccount} disabled={savingAccount || !profile}>
            {savingAccount ? "Speichern…" : "Speichern"}
          </Button>
        </CardContent>
      </Card>

      {/* Login */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 stroke-[1.5] text-accent" />
            Login-Daten
          </CardTitle>
          <CardDescription>
            E-Mail und Passwort für die Anmeldung bei Cura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firma.ch"
              />
            </div>
            <Button
              onClick={saveEmail}
              disabled={savingEmail || !profile}
              variant="outline"
              size="sm"
            >
              {savingEmail ? "Speichern…" : "E-Mail speichern"}
            </Button>
          </div>

          <div className="border-t border-stroke pt-6 space-y-4">
            <p className="text-body font-medium text-navy">Passwort ändern</p>
            <div className="space-y-2">
              <Label htmlFor="current-password">Aktuelles Passwort</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Neues Passwort</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Mindestens 6 Zeichen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Passwort bestätigen</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button
              onClick={savePassword}
              disabled={savingPassword || !profile}
              size="sm"
            >
              {savingPassword ? "Speichern…" : "Passwort ändern"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Abrechnung */}
      <section id="pricing" className="scroll-mt-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2>Abrechnung</h2>
            <p className="mt-1 text-text-muted">
              Wählen Sie den Plan, der zu Ihnen passt.
            </p>
          </div>
          {/* Interval toggle */}
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
              !isPro ? "border-accent shadow-[0_8px_32px_rgba(255,107,26,0.10)]" : "border-stroke"
            )}
          >
            {!isPro && (
              <span className="absolute right-6 top-6 rounded-full bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent">
                Aktueller Plan
              </span>
            )}
            <p className="text-[15px] font-semibold text-navy">Gratis</p>
            <p className="mt-1 text-text-muted">Zum Ausprobieren.</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-sans text-[40px] font-semibold leading-none text-navy">
                CHF 0
              </span>
              <span className="text-text-muted">/ Monat</span>
            </div>
            <ul className="mt-6 space-y-3">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-text">
                  <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 stroke-[2] text-accent" />
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
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/30 blur-3xl"
            />
            {isPro && (
              <span className="absolute right-6 top-6 rounded-full bg-accent px-2.5 py-1 text-[12px] font-medium text-white">
                Aktueller Plan
              </span>
            )}
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="h-[18px] w-[18px] stroke-[1.5] text-accent" />
              Cura Pro
            </p>
            <p className="mt-1 text-white/70">Für den vollen Automatik-Betrieb.</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-sans text-[40px] font-semibold leading-none">
                {proPrice}
              </span>
              <span className="text-white/70">{proPer}</span>
            </div>
            {interval === "yearly" && (
              <p className="mt-1 text-[13px] text-white/60">
                entspricht CHF 83 / Monat
              </p>
            )}
            <ul className="mt-6 space-y-3">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-white/90">
                  <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 stroke-[2] text-accent" />
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

      {/* Support */}
      <Card className="max-w-xl">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-5 w-5 stroke-[1.5] text-accent" />
            <div>
              <p className="font-medium text-navy">Support</p>
              <p className="text-body text-text-muted">
                Wir helfen Ihnen gerne weiter.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:support@cura.ch">Support kontaktieren</a>
          </Button>
        </CardContent>
      </Card>

      {/* Logout */}
      <Card className="max-w-xl">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <LogOut className="h-5 w-5 stroke-[1.5] text-accent" />
            <div>
              <p className="font-medium text-navy">Abmelden</p>
              <p className="text-body text-text-muted">
                Sitzung beenden und zur Anmeldeseite wechseln.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Abmelden…" : "Abmelden"}
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="max-w-xl border-red-200">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="font-medium text-navy">Konto löschen</p>
            <p className="text-body text-text-muted">
              Entfernt alle Daten unwiderruflich.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 stroke-[1.5]" />
            Konto löschen
          </Button>
        </CardContent>
      </Card>

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
              <p className="flex items-start gap-2 font-medium text-navy">
                <Info className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.5] text-accent" />
                Weiterleitung entfernen
              </p>
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
