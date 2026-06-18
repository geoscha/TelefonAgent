"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthField,
  AuthFrame,
  authButtonClass,
  authInputClass,
  authLinkClass,
} from "@/components/landing/AuthFrame";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError("Benutzername oder Code ist nicht korrekt.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AuthField label="Benutzername">
        <input
          id="admin-user"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={authInputClass}
          required
        />
      </AuthField>
      <AuthField label="Code">
        <input
          id="admin-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
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
  );
}

export default function AdminLoginPage() {
  return (
    <AuthFrame
      title="Admin"
      footer={
        <p className="text-center text-[13px] text-white/60">
          <Link href="/login" className={authLinkClass}>
            Zur Anmeldung
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <p className="text-[14px] text-white/60">Laden…</p>
        }
      >
        <AdminLoginForm />
      </Suspense>
    </AuthFrame>
  );
}
