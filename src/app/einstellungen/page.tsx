"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { createClient } from "@/lib/supabase/client";
import {
  forwardingDeactivateCode,
  forwardingDeactivateHint,
  type ForwardingType,
} from "@/lib/phone/forwarding-codes";
import type { OnboardingPhase } from "@/lib/onboarding-types";
import type { TokenBalanceView } from "@/lib/billing/quota-display";
import { tokenBalanceHighlight } from "@/lib/billing/quota-display";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { SupportChatPanel } from "@/components/support/SupportChatPanel";
import { userPanelClass } from "@/components/user/user-styles";

type BillingPlan = "free" | "pro";

interface Profile {
  name: string;
  email: string;
  plan: BillingPlan;
  tokenBalance?: TokenBalanceView;
}

export default function ProfilPage() {
  const router = useRouter();
  const setupDemo = useSetupDemoOptional();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [curaNumber, setCuraNumber] = useState<string | null>(null);
  const [forwardingType, setForwardingType] =
    useState<ForwardingType>("bedingt");
  const [onboardingPhase, setOnboardingPhase] =
    useState<OnboardingPhase | null>(null);
  const [startingDemo, setStartingDemo] = useState(false);

  const profileLoaded = useRef(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        setName(p.name ?? "");
        setEmail(p.email ?? "");
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

  async function startSetupDemo() {
    if (!setupDemo) return;
    setStartingDemo(true);
    try {
      await setupDemo.restart();
      toast.success("Demo gestartet — folgen Sie den Schritten.");
    } catch {
      toast.error("Demo konnte nicht gestartet werden.");
    } finally {
      setStartingDemo(false);
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
  const quotaHighlight = profile?.tokenBalance
    ? tokenBalanceHighlight(profile.tokenBalance)
    : { value: "—", suffix: "Tokens" };

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

      <section className="scroll-mt-8 space-y-4 border-t border-stroke pt-8">
        <p className="text-body text-text-muted">
          Plan, Kontingent und Upgrade verwalten Sie unter Abrechnung.
        </p>
        <Link
          href="/billing"
          className="inline-flex text-body font-medium text-accent underline-offset-4 hover:underline"
        >
          Zur Abrechnung
        </Link>
      </section>

      <section className="scroll-mt-8 space-y-3 border-t border-stroke pt-8">
        <p className="text-body font-medium text-navy">Einführungs-Demo</p>
        <p className="text-body text-text-muted">
          Schritt-für-Schritt-Anleitung: Agent konfigurieren und erste
          Telefonnummer beantragen. Sie können die Demo jederzeit überspringen.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={startingDemo || setupDemo?.active}
          onClick={() => void startSetupDemo()}
        >
          {setupDemo?.active
            ? "Demo läuft…"
            : startingDemo
              ? "Starten…"
              : "Demo starten"}
        </Button>
      </section>

      <div className="border-t border-stroke pt-8">
        <button
          type="button"
          onClick={() => setSupportOpen((open) => !open)}
          className="text-body text-accent underline-offset-4 hover:underline"
        >
          Support kontaktieren
        </button>

        {supportOpen && (
          <div className={`${userPanelClass} mt-4 p-4`}>
            <SupportChatPanel active={supportOpen} />
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
