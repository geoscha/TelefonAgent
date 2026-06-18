"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { BrandToaster } from "@/components/layout/BrandToaster";

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/passwort-");

  return (
    <>
      {isAuthRoute ? children : <AppShell>{children}</AppShell>}
      <BrandToaster />
    </>
  );
}
