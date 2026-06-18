"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandGradient } from "@/components/brand/BrandGradient";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function PasswortZuruecksetzenPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
      setReady(true);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("Passwort konnte nicht gesetzt werden.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Passwort konnte nicht gesetzt werden.");
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
        </div>

        <div className="rounded-card border border-white/25 bg-surface/95 p-8 backdrop-blur-sm">
          <h1 className="font-sans font-semibold text-[28px] text-navy">
            Neues Passwort
          </h1>
          <p className="mt-2 text-body text-text-muted">
            Wählen Sie ein neues Passwort für Ihr Konto.
          </p>

          {!ready ? (
            <p className="mt-8 text-body text-text-muted">Laden…</p>
          ) : !hasSession ? (
            <div className="mt-8 space-y-4">
              <p className="text-body text-red-600" role="alert">
                Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen
                neuen Link an.
              </p>
              <Button asChild className="w-full">
                <Link href="/passwort-vergessen">Neuen Link anfordern</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">Neues Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mindestens 6 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Passwort bestätigen</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && (
                <p className="text-caption text-red-600" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Speichern…" : "Passwort speichern"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
