"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandGradient } from "@/components/brand/BrandGradient";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/client";

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const redirectTo = `${getSiteUrl()}/auth/callback?next=/passwort-zuruecksetzen`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        setError("Link konnte nicht gesendet werden. Bitte erneut versuchen.");
        return;
      }
      setSent(true);
    } catch {
      setError("Link konnte nicht gesendet werden. Bitte erneut versuchen.");
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
            Passwort vergessen
          </h1>
          <p className="mt-2 text-body text-text-muted">
            Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
          </p>

          {sent ? (
            <div className="mt-8 space-y-4">
              <p className="text-body text-text" role="status">
                Falls ein Konto mit{" "}
                <span className="font-medium">{email}</span> existiert, haben
                wir Ihnen eine E-Mail mit weiteren Schritten gesendet.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Zurück zur Anmeldung</Link>
              </Button>
            </div>
          ) : (
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
              {error && (
                <p className="text-caption text-red-600" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Wird gesendet…" : "Link senden"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-caption text-text-muted">
            <Link href="/login" className="text-accent hover:underline">
              Zurück zur Anmeldung
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
