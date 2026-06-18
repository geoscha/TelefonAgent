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

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Registrierung fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(
          "Konto erstellt, Anmeldung fehlgeschlagen. Bitte melden Sie sich unter «Anmelden» an."
        );
        return;
      }

      router.refresh();
      await fetch("/api/provision", { method: "POST" }).catch(() => {});
      window.location.assign("/telefonagent");
    } catch {
      setError("Registrierung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12">
      <BrandGradient variant="warm" blur="medium" className="opacity-90" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-12 flex flex-col items-center text-center">
          <CuraLogo mode="contextual" theme="light" size="lg" showMark />
          <p className="mt-4 max-w-xs text-body text-white/80">
            KI-Telefonagent für Schweizer Immobilienverwaltungen
          </p>
        </div>

        <div className="rounded-card border border-white/25 bg-surface/95 p-8 backdrop-blur-sm">
          <h1 className="font-sans font-semibold text-[28px] text-navy">
            Konto erstellen
          </h1>
          <p className="mt-2 text-body text-text-muted">
            Registrieren Sie sich, um Ihren Telefonagenten einzurichten.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Vor- und Nachname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
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
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mindestens 6 Zeichen"
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
              {loading ? "Konto wird erstellt…" : "Registrieren"}
            </Button>
          </form>

          <p className="mt-6 text-center text-caption text-text-muted">
            Bereits ein Konto?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Anmelden
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
