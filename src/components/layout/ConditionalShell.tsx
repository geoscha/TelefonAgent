"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { BrandToaster } from "@/components/layout/BrandToaster";

function AppShellLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <Loader2 className="h-6 w-6 animate-spin text-[#525866]" aria-label="Laden" />
    </div>
  );
}

const AppShell = dynamic(
  () => import("@/components/layout/AppShell").then((m) => m.AppShell),
  { ssr: false, loading: AppShellLoading }
);

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicShell =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/passwort-");

  return (
    <>
      {isPublicShell ? children : <AppShell>{children}</AppShell>}
      <BrandToaster />
    </>
  );
}
