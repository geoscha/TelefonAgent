"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { UserSidebar } from "@/components/layout/UserSidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SetupDemoOverlay } from "@/components/onboarding/SetupDemoOverlay";
import { SetupDemoProvider } from "@/components/onboarding/SetupDemoProvider";
import { SetupDemoWelcomeModal } from "@/components/onboarding/SetupDemoWelcomeModal";
import { useBackgroundSync } from "@/lib/hooks/useBackgroundSync";
import { landingNavBtnSecondary } from "@/components/landing/landing-buttons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function UserShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profileName, setProfileName] = useState("Profil");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: { name?: string }) => {
        const trimmed = p.name?.trim();
        if (trimmed) setProfileName(trimmed);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const displayName =
    profileName.trim().split(/\s+/)[0] || profileName || "Profil";

  useBackgroundSync({ syncCalls: false });

  return (
    <SetupDemoProvider>
      <div className="user-app min-h-screen bg-white">
        <div className="flex h-screen overflow-hidden">
          <UserSidebar />

          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-[#E1E4EA] bg-white px-4 sm:px-5">
              <Link
                href="/einstellungen"
                className={cn(landingNavBtnSecondary, "max-w-[160px] truncate")}
              >
                {displayName}
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className={landingNavBtnSecondary}
              >
                {loggingOut ? "Abmelden…" : "Abmelden"}
              </button>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white p-4 sm:p-5 lg:p-6">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette />
        <SetupDemoWelcomeModal />
        <SetupDemoOverlay />
      </div>
    </SetupDemoProvider>
  );
}
