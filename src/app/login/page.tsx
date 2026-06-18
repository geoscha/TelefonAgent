"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandGradient } from "@/components/brand/BrandGradient";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      router.push("/");
      router.refresh();
    } catch {
      setError("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12">
      <BrandGradient variant="warm" blur="medium" className="opacity-90" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-12 flex flex-col items-center text-center">
          {/* Contextual light variant on gradient — not difference (cleaner on warm mesh) */}
          <CuraLogo mode="contextual" theme="light" size="lg" showMark />
          <p className="mt-4 max-w-xs text-body text-white/80">
            KI-Telefonagent für Schweizer Immobilienverwaltungen
          </p>
        </div>

        <div className="rounded-card border border-white/25 bg-surface/95 p-8 backdrop-blur-sm">
          <h1 className="font-sans font-semibold text-[28px] text-navy">Anmelden</h1>
          <p className="mt-2 text-body text-text-muted">
            Melden Sie sich an, um Ihren Telefonagenten zu verwalten.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="verwaltung@firma.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Passwort</Label>
                <Link
                  href="/passwort-vergessen"
                  className="text-caption text-accent hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-caption text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Anmelden…" : "Anmelden"}
            </Button>
          </form>

          <p className="mt-6 text-center text-caption text-text-muted">
            Noch kein Konto?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Jetzt registrieren
            </Link>
          </p>

          <div className="mt-8 border-t border-stroke pt-6">
            <button
              type="button"
              onClick={() => setShowAdmin((v) => !v)}
              className="w-full text-center text-caption text-text-muted hover:text-text"
            >
              {showAdmin ? "Admin-Zugang ausblenden" : "Admin-Zugang"}
            </button>
            {showAdmin && (
              <form onSubmit={handleAdminSubmit} className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="admin-user">Benutzername</Label>
                  <Input
                    id="admin-user"
                    autoComplete="username"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-code">Code</Label>
                  <Input
                    id="admin-code"
                    type="password"
                    autoComplete="current-password"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                  />
                </div>
                {adminError && (
                  <p className="text-caption text-red-600" role="alert">
                    {adminError}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={adminLoading}
                >
                  {adminLoading ? "Anmelden…" : "Als Admin anmelden"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
