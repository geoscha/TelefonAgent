"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authButtonOutlineClass,
  authInputClass,
  authLinkClass,
} from "@/components/landing/AuthFrame";
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
        setError("Link konnte nicht gesendet werden.");
        return;
      }
      setSent(true);
    } catch {
      setError("Link konnte nicht gesendet werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Passwort vergessen"
      footer={
        <p className="text-center text-[13px] text-white/60">
          <Link href="/login" className={authLinkClass}>
            Zur Anmeldung
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-white/80" role="status">
            Falls ein Konto mit {email} existiert, erhalten Sie eine E-Mail.
          </p>
          <Link href="/login" className={authButtonOutlineClass}>
            Zur Anmeldung
          </Link>
        </div>
      ) : (
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
          {error && (
            <p className="text-[13px] text-red-200" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className={authButtonClass}>
            {loading ? "Senden…" : "Link senden"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
