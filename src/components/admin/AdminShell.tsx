"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Phone, Settings, Users, Wallet } from "lucide-react";
import { CuraLogo } from "@/components/brand/CuraLogo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Anfragen" },
  { href: "/admin/numbers", label: "Nummern", icon: Phone },
  { href: "/admin/finances", label: "Finanzen", icon: Wallet },
  { href: "/admin/customers", label: "Kunden", icon: Users },
  { href: "/admin/settings", label: "Einstellungen", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-white text-text">
      <header className="sticky top-0 z-20 border-b border-stroke bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <CuraLogo mode="contextual" theme="dark" size="sm" href="/admin" />
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:text-[14px]",
                    active
                      ? "bg-accent text-white"
                      : "text-text-muted hover:bg-bg hover:text-navy"
                  )}
                >
                  {Icon && (
                    <Icon className="h-4 w-4 stroke-[1.5]" aria-hidden />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 rounded-btn border border-stroke bg-white px-3 py-2 text-[13px] font-medium text-navy transition-colors hover:bg-bg disabled:opacity-60 sm:text-[14px]"
          >
            <LogOut className="h-4 w-4 stroke-[1.5]" aria-hidden />
            {loggingOut ? "…" : "Abmelden"}
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
