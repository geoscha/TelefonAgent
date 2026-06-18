import "server-only";

import type { CalendarProvider } from "@/lib/store";

export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

export function redirectUri(provider: CalendarProvider): string {
  return `${APP_URL}/api/integrations/${provider}/callback`;
}

/** Whether the OAuth app credentials for a provider are present in the env. */
export function isConfigured(provider: CalendarProvider): boolean {
  switch (provider) {
    case "google":
      return Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      );
    case "microsoft":
      return Boolean(
        process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      );
    case "apple":
      // Apple needs no app registration — the customer supplies an Apple ID and
      // an app-specific password directly.
      return true;
  }
}
