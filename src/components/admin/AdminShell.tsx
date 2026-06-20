"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ClipboardList,
  LogOut,
  Phone,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import { LinkerLogo } from "@/components/brand/LinkerLogo";
import {
  landingBtnSecondary,
  landingNavBtnSecondary,
} from "@/components/landing/landing-buttons";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Anfragen", icon: ClipboardList },
  { href: "/admin/numbers", label: "Nummern", icon: Phone },
  { href: "/admin/finances", label: "Finanzen", icon: Wallet },
  { href: "/admin/customers", label: "Kunden", icon: Users },
  { href: "/admin/settings", label: "Einstellungen", icon: Settings },
] as const;

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
    <div className="user-app min-h-screen bg-white">
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#E1E4EA] bg-white px-3 py-4 lg:w-[240px]">
          <div className="mb-6 px-1">
            <LinkerLogo mode="contextual" theme="dark" size="sm" href="/admin" />
          </div>

          <nav
            className="flex flex-1 flex-col gap-0.5"
            aria-label="Admin-Navigation"
          >
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "landing-body flex items-center gap-2.5 landing-radius-sm px-3 py-2.5 transition-colors",
                    active
                      ? "bg-[#F5F7FA] font-medium text-[#0E121B]"
                      : "text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[17px] w-[17px] shrink-0 stroke-[1.5]",
                      active ? "text-[#335cff]" : "text-[#99A0AE]"
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 pt-3 border-t border-[#E1E4EA]">
            <Link
              href="/admin/numbers#bestellen"
              className={cn(
                landingBtnSecondary,
                "w-full justify-center",
                pathname.startsWith("/admin/numbers") &&
                  "ring-1 ring-[#335cff]/30"
              )}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Nummer bestellen
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-white">
          <header className="flex h-14 shrink-0 items-center justify-end border-b border-[#E1E4EA] bg-white px-4 sm:px-5">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={cn(
                landingNavBtnSecondary,
                "inline-flex items-center gap-2"
              )}
            >
              <LogOut className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden />
              {loggingOut ? "…" : "Abmelden"}
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white p-4 sm:p-5 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
