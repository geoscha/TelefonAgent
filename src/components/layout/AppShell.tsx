"use client";

import { UserShell } from "@/components/layout/UserShell";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <UserShell>{children}</UserShell>;
}
