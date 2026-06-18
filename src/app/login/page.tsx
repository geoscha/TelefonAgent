"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthOAuthError } from "@/components/auth/AuthOAuthError";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authButtonOutlineClass,
  authErrorClass,
  authInputClass,
  authLinkClass,
  authMutedTextClass,
} from "@/components/landing/AuthFrame";
import { signInWithGoogle } from "@/lib/auth/google-sign-in";
import { createClient } from "@/lib/supabase/client";

type LoginStep = "email" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Bitte geben Sie Ihre E-Mail-Adresse ein.");
      return;
    }
    setStep("password");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError("E-Mail oder Passwort ist nicht korrekt.");
        return;
      }
      await fetch("/api/provision", { method: "POST" }).catch(() => {});
      router.push("/anrufe");
      router.refresh();
    } catch {
      setError("Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    const result = await signInWithGoogle("login");
    if (!result.ok) {
      setError(result.error);
      setGoogleLoading(false);
    }
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUser, code: adminCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAdminError("Benutzername oder Code ist nicht korrekt.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setAdminError("Anmeldung fehlgeschlagen.");
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Willkommen"
      subtitle="Melden Sie sich bei Cura an, um fortzufahren."
      showGoogle={step === "email"}
      onGoogleClick={handleGoogleSignIn}
      googleLoading={googleLoading}
      footer={
        step === "email" ? (
          <p className={`text-center ${authMutedTextClass}`}>
            Noch kein Konto?{" "}
            <Link href="/signup" className={authLinkClass}>
              Registrieren
            </Link>
          </p>
        ) : (
          <p className="text-center">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
              }}
              className={authLinkClass}
            >
              Andere E-Mail verwenden
            </button>
          </p>
        )
      }
    >
      <AuthOAuthError />
      {step === "email" ? (
        <form onSubmit={handleEmailContinue} className="space-y-4">
          <AuthField label="E-Mail" hideLabel>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Geschäftliche E-Mail-Adresse *"
              className={authInputClass}
              required
            />
          </AuthField>
          {error && (
            <p className={authErrorClass} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={authButtonClass}>
            Weiter
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className={`${authMutedTextClass} text-[14px]`}>{email}</p>
          <AuthField
            label="Passwort"
            action={
              <Link href="/passwort-vergessen" className={authLinkClass}>
                Vergessen?
              </Link>
            }
          >
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              className={authInputClass}
              required
              autoFocus
            />
          </AuthField>
          {error && (
            <p className={authErrorClass} role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className={authButtonClass}>
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      )}

      <div className="mt-8 border-t border-[#E1E4EA] pt-5">
        <button
          type="button"
          onClick={() => setShowAdmin((v) => !v)}
          className={`w-full text-center ${authMutedTextClass} hover:text-[#0E121B]`}
        >
          {showAdmin ? "Admin ausblenden" : "Admin"}
        </button>
        {showAdmin && (
          <form onSubmit={handleAdminSubmit} className="mt-4 space-y-3">
            <AuthField label="Benutzername">
              <input
                id="admin-user"
                autoComplete="username"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                className={authInputClass}
              />
            </AuthField>
            <AuthField label="Code">
              <input
                id="admin-code"
                type="password"
                autoComplete="current-password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className={authInputClass}
              />
            </AuthField>
            {adminError && (
              <p className={authErrorClass} role="alert">
                {adminError}
              </p>
            )}
            <button
              type="submit"
              disabled={adminLoading}
              className={authButtonOutlineClass}
            >
              {adminLoading ? "Anmelden…" : "Admin anmelden"}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
