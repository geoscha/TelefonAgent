import type { NextRequest } from "next/server";

export const OAUTH_ORIGIN_COOKIE = "oauth_app_origin";

/** Resolves the public app URL for OAuth redirects. */
export function resolveAppUrl(req?: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) {
      const proto =
        req.headers.get("x-forwarded-proto") ??
        (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
      const origin = `${proto}://${host}`.replace(/\/$/, "");
      // Dev: use the URL the user actually opened (localhost vs tunnel).
      if (process.env.NODE_ENV !== "production") {
        return origin;
      }
    }
  }

  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function calendarOAuthRedirectUri(
  provider: "google" | "microsoft",
  appUrl: string
): string {
  return `${appUrl}/api/integrations/${provider}/callback`;
}

export function mailOAuthRedirectUri(
  provider: "gmail" | "outlook",
  appUrl: string
): string {
  return `${appUrl}/api/integrations/mail/${provider}/callback`;
}
