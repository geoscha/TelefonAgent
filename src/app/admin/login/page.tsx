"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BrandGradient } from "@/components/brand/BrandGradient";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="admin-user">Benutzername</Label>
        <Input
          id="admin-user"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-code">Code</Label>
        <Input
          id="admin-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>
      {error && (
        <p className="text-caption text-red-600" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Anmelden…" : "Admin anmelden"}
      </Button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12">
      <BrandGradient variant="warm" blur="medium" className="opacity-90" />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-12 flex flex-col items-center text-center">
          <CuraLogo mode="contextual" theme="light" size="lg" showMark />
        </div>
        <div className="rounded-card border border-white/25 bg-surface/95 p-8 backdrop-blur-sm">
          <h1 className="font-sans font-semibold text-[28px] text-navy">
            Admin
          </h1>
          <p className="mt-2 text-body text-text-muted">
            Interner Zugang zur Anfragenverwaltung.
          </p>
          <Suspense fallback={<p className="mt-8 text-body text-text-muted">Laden…</p>}>
            <AdminLoginForm />
          </Suspense>
          <p className="mt-6 text-center text-caption text-text-muted">
            <Link href="/login" className="text-accent hover:underline">
              Zur normalen Anmeldung
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
