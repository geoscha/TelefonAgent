import "server-only";

import type { MailConnection } from "@/lib/integrations/mail/store";

function normalizeAppPassword(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export async function appleMailConnect(
  appleId: string,
  appPassword: string
): Promise<Partial<MailConnection>> {
  const normalizedPassword = normalizeAppPassword(appPassword);
  if (!appleId.trim() || !normalizedPassword) {
    throw new Error("Bitte Apple-ID und App-Passwort angeben.");
  }

  return {
    connected: true,
    accountLabel: appleId.trim(),
    appPassword: normalizedPassword,
    connectedAt: new Date().toISOString(),
  };
}
