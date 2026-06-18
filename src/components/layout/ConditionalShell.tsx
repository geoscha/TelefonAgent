"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { BrandToaster } from "@/components/layout/BrandToaster";

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
