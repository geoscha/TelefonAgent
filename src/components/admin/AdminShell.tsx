"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Phone, Settings, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CuraLogo } from "@/components/brand/CuraLogo";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-stroke bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <CuraLogo mode="difference" size="sm" href="/admin" />
            <nav className="flex items-center gap-1 text-body">
              <Link
                href="/admin"
                className={`rounded-btn px-3 py-1.5 font-medium ${
                  pathname === "/admin"
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Anfragen
              </Link>
              <Link
                href="/admin/numbers"
                className={`flex items-center gap-1.5 rounded-btn px-3 py-1.5 font-medium ${
                  pathname === "/admin/numbers"
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Phone className="h-4 w-4 stroke-[1.5]" />
                Nummern
              </Link>
              <Link
                href="/admin/finances"
                className={`flex items-center gap-1.5 rounded-btn px-3 py-1.5 font-medium ${
                  pathname === "/admin/finances"
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Wallet className="h-4 w-4 stroke-[1.5]" />
                Finanzen
              </Link>
              <Link
                href="/admin/customers"
                className={`flex items-center gap-1.5 rounded-btn px-3 py-1.5 font-medium ${
                  pathname.startsWith("/admin/customers")
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Users className="h-4 w-4 stroke-[1.5]" />
                Kunden
              </Link>
              <Link
                href="/admin/settings"
                className={`flex items-center gap-1.5 rounded-btn px-3 py-1.5 font-medium ${
                  pathname === "/admin/settings"
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Settings className="h-4 w-4 stroke-[1.5]" />
                Einstellungen
              </Link>
            </nav>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="mr-2 h-4 w-4 stroke-[1.5]" />
            {loggingOut ? "Abmelden…" : "Abmelden"}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
