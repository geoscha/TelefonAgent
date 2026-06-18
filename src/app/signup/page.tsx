"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authInputClass,
  authLinkClass,
} from "@/components/landing/AuthFrame";
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
      setError("Passwort mindestens 6 Zeichen.");
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
        setError(data.error ?? "Registrierung fehlgeschlagen.");
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Konto erstellt. Bitte anmelden.");
        return;
      }

      router.refresh();
      await fetch("/api/provision", { method: "POST" }).catch(() => {});
      window.location.assign("/telefonagent");
    } catch {
      setError("Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Registrieren"
      footer={
        <p className="text-center text-[13px] text-white/60">
          Bereits ein Konto?{" "}
          <Link href="/login" className={authLinkClass}>
            Anmelden
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Name">
          <input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputClass}
            required
          />
        </AuthField>
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
        <AuthField label="Passwort">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
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
          {loading ? "Erstellen…" : "Konto erstellen"}
        </button>
      </form>
    </AuthFrame>
  );
}
