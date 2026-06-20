"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Settings,
  Menu,
  X,
  LogOut,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AvatarGradient } from "@/components/brand/AvatarGradient";
import { LinkerLogo } from "@/components/brand/LinkerLogo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/anrufe", label: "Anrufe", icon: LayoutDashboard },
  { href: "/telefonagent", label: "Telefonagent", icon: Bot },
  { href: "/einstellungen", label: "Profil", icon: Settings },
];

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function GlassNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setUserMenuOpen(false);
    }
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 lg:px-8">
        <div className="glass-pill mx-auto flex h-[60px] max-w-4xl items-center justify-between gap-6 rounded-full px-6 lg:px-8">
          <LinkerLogo mode="difference" size="sm" href="/anrufe" />

          <nav className="hidden md:flex md:items-center">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = isActiveHref(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center rounded-full px-3 py-1.5 text-[15px] font-medium leading-none transition-colors",
                        isActive ? "text-accent" : "text-text-muted hover:text-navy"
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-full bg-accent/[0.1]"
                          transition={{ type: "spring", stiffness: 450, damping: 38 }}
                        />
                      )}
                      <span className="relative z-10">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center">
            <div className="relative hidden sm:block" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Benutzermenü"
              >
                <AvatarGradient name="Verwaltung Demo" size="sm" />
              </button>
              {userMenuOpen && (
                <div className="glass-pill absolute right-0 top-12 z-50 w-48 rounded-card p-1.5">
                  <Link
                    href="/einstellungen"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-btn px-3 py-2 text-[15px] font-medium text-text-muted transition-colors hover:bg-accent/[0.06] hover:text-text"
                  >
                    <User className="h-[18px] w-[18px] stroke-[1.5]" />
                    Profil
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-left text-[15px] font-medium text-text-muted transition-colors hover:bg-accent/[0.06] hover:text-text disabled:opacity-60"
                  >
                    <LogOut className="h-[18px] w-[18px] stroke-[1.5]" />
                    {loggingOut ? "Abmelden…" : "Abmelden"}
                  </button>
                </div>
              )}
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-text md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Menü schliessen" : "Menü öffnen"}
            >
              {mobileOpen ? (
                <X className="h-5 w-5 stroke-[1.5]" />
              ) : (
                <Menu className="h-5 w-5 stroke-[1.5]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-navy/15 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="glass-pill fixed inset-x-4 top-[4.75rem] z-50 rounded-card md:hidden">
            <nav className="px-3 py-3">
              <ul className="space-y-0.5">
                {navItems.map((item) => {
                  const isActive = isActiveHref(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-btn px-3 py-2.5 text-[15px] font-medium",
                          isActive
                            ? "bg-accent/[0.08] text-accent"
                            : "text-text-muted hover:text-navy"
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] stroke-[1.5]" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
                <li className="mt-0.5 border-t border-stroke pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      void handleLogout();
                    }}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left text-[15px] font-medium text-text-muted hover:text-text disabled:opacity-60"
                  >
                    <LogOut className="h-[18px] w-[18px] stroke-[1.5]" />
                    {loggingOut ? "Abmelden…" : "Abmelden"}
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
