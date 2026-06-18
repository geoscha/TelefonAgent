"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authInputClass,
} from "@/components/landing/AuthFrame";
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
      setError("Passwort mindestens 6 Zeichen.");
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
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
      router.push("/anrufe");
      router.refresh();
    } catch {
      setError("Passwort konnte nicht gesetzt werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="Neues Passwort">
      {!ready ? (
        <p className="text-[14px] text-white/60">Laden…</p>
      ) : !hasSession ? (
        <div className="space-y-4">
          <p className="text-[14px] text-red-200" role="alert">
            Link ungültig oder abgelaufen.
          </p>
          <Link href="/passwort-vergessen" className={authButtonClass}>
            Neuen Link anfordern
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label="Neues Passwort">
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={authInputClass}
              required
            />
          </AuthField>
          <AuthField label="Bestätigen">
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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
            {loading ? "Speichern…" : "Speichern"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
