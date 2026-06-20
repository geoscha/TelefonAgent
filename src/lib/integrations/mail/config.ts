import "server-only";

import type { MailProviderId } from "@/lib/integrations/mail/provider-meta";

export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

export function mailRedirectUri(provider: "gmail" | "outlook"): string {
  return `${APP_URL}/api/integrations/mail/${provider}/callback`;
}

export function isMailConfigured(provider: MailProviderId): boolean {
  switch (provider) {
    case "gmail":
      return Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      );
    case "outlook":
      return Boolean(
        process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      );
    case "apple_mail":
      return true;
  }
}
