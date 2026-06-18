import "server-only";

import type { CalendarConnection } from "@/lib/store";
import { redirectUri } from "./config";
import {
  DEFAULT_TZ,
  type CalendarContext,
  type CalendarEventInput,
  type CreatedEvent,
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri("google"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchanges the auth code for tokens and returns a connection patch (no persist). */
export async function googleExchangeCode(
  code: string
): Promise<Partial<CalendarConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri("google"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Token-Austausch fehlgeschlagen: ${await res.text()}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const email = await googleEmail(tok.access_token);
  return {
    connected: true,
    accountLabel: email,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    connectedAt: new Date().toISOString(),
  };
}

async function googleEmail(accessToken: string): Promise<string | undefined> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { email?: string };
    return j.email;
  } catch {
    return undefined;
  }
}

async function googleAccessToken(ctx: CalendarContext): Promise<string> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accessToken) {
    throw new Error("Google Kalender ist nicht verbunden.");
  }
  if (conn.expiresAt && conn.expiresAt > Date.now() + 60_000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken) return conn.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Token-Refresh fehlgeschlagen: ${await res.text()}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  await ctx.save({
    accessToken: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  });
  return tok.access_token;
}

export async function googleCreateEvent(
  input: CalendarEventInput,
  ctx: CalendarContext
): Promise<CreatedEvent> {
  const token = await googleAccessToken(ctx);
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        location: input.location,
        start: { dateTime: input.startIso, timeZone: input.timeZone ?? DEFAULT_TZ },
        end: { dateTime: input.endIso, timeZone: input.timeZone ?? DEFAULT_TZ },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Google Termin anlegen fehlgeschlagen: ${await res.text()}`);
  }
  const j = (await res.json()) as { id: string; htmlLink?: string };
  return { id: j.id, htmlLink: j.htmlLink };
}
