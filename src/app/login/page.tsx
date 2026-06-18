"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authButtonOutlineClass,
  authInputClass,
  authLinkClass,
} from "@/components/landing/AuthFrame";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

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
      title="Anmelden"
      footer={
        <p className="text-center text-[13px] text-white/60">
          Noch kein Konto?{" "}
          <Link href="/signup" className={authLinkClass}>
            Registrieren
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="E-Mail">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            required
          />
        </AuthField>
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
            className={authInputClass}
            required
          />
        </AuthField>
        {error && (
          <p className="text-[13px] text-red-200" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Anmelden…" : "Anmelden"}
        </button>
      </form>

      <div className="mt-6 border-t border-white/15 pt-5">
        <button
          type="button"
          onClick={() => setShowAdmin((v) => !v)}
          className="w-full text-center text-[13px] text-white/55 hover:text-white/80"
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
              <p className="text-[13px] text-red-200" role="alert">
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
