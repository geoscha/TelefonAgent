import "server-only";

import type { CalendarConnection } from "@/lib/store";
import {
  DEFAULT_TZ,
  type CalendarContext,
  type CalendarEventInput,
  type CreatedEvent,
  type ListedCalendarEvent,
} from "./types";
import {
  AGENT_CREATED_DESCRIPTION,
  isAgentCreatedCalendarEvent,
  isCancelledCalendarEvent,
} from "./agent-labels";
import { dayBoundsInTimeZone } from "./day-bounds";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export function googleAuthUrl(state: string, redirectUriValue: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUriValue,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchanges the auth code for tokens and returns a connection patch (no persist). */
export async function googleExchangeCode(
  code: string,
  redirectUriValue: string
): Promise<Partial<CalendarConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUriValue,
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
        extendedProperties: {
          private: { linkerAgent: "1" },
        },
        colorId: "6",
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Google Termin anlegen fehlgeschlagen: ${await res.text()}`);
  }
  const j = (await res.json()) as { id: string; htmlLink?: string };
  return { id: j.id, htmlLink: j.htmlLink };
}

type GoogleEventItem = {
  id?: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

function googleInstantIso(
  value: { dateTime?: string; date?: string } | undefined
): string | undefined {
  if (!value) return undefined;
  if (value.dateTime) return value.dateTime;
  if (value.date) return `${value.date}T09:00:00+01:00`;
  return undefined;
}

function mapGoogleListedEvent(item: GoogleEventItem): ListedCalendarEvent | null {
  const id = item.id?.trim();
  const startIso = googleInstantIso(item.start);
  if (!id || !startIso) return null;

  const title = item.summary?.trim() || "Termin";
  if (isCancelledCalendarEvent(title, item.status)) return null;

  const agentCreated =
    item.extendedProperties?.private?.linkerAgent === "1" ||
    item.extendedProperties?.private?.curaAgent === "1" ||
    isAgentCreatedCalendarEvent(title, item.description);

  return {
    id,
    title,
    description: item.description,
    startIso,
    endIso: googleInstantIso(item.end) ?? startIso,
    agentCreated,
  };
}

export async function googleListEventsInRange(
  rangeStartIso: string,
  rangeEndIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const token = await googleAccessToken(ctx);
  const params = new URLSearchParams({
    timeMin: new Date(rangeStartIso).toISOString(),
    timeMax: new Date(rangeEndIso).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Google Kalender konnte nicht gelesen werden: ${await res.text()}`);
  }

  const data = (await res.json()) as { items?: GoogleEventItem[] };
  return (data.items ?? [])
    .map(mapGoogleListedEvent)
    .filter((event): event is ListedCalendarEvent => event !== null);
}

export async function googleListEventsOnDay(
  dayIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const { timeMin, timeMax } = dayBoundsInTimeZone(dayIso, DEFAULT_TZ);
  return googleListEventsInRange(timeMin, timeMax, ctx);
}

export async function googleDeleteEvent(
  eventId: string,
  ctx: CalendarContext
): Promise<void> {
  const token = await googleAccessToken(ctx);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (res.status === 404 || res.status === 410 || res.status === 204) return;
  if (!res.ok) {
    throw new Error(`Google Termin konnte nicht gelöscht werden: ${await res.text()}`);
  }
}

export async function googleRescheduleEvent(
  input: {
    eventId: string;
    startIso: string;
    endIso: string;
    title?: string;
  },
  ctx: CalendarContext
): Promise<void> {
  const token = await googleAccessToken(ctx);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: input.startIso, timeZone: DEFAULT_TZ },
        end: { dateTime: input.endIso, timeZone: DEFAULT_TZ },
        ...(input.title !== undefined ? { summary: input.title } : {}),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Google Termin konnte nicht verschoben werden: ${await res.text()}`
    );
  }
}

export async function googleCancelEvent(
  eventId: string,
  ctx: CalendarContext
): Promise<void> {
  const token = await googleAccessToken(ctx);
  const getRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (getRes.status === 404) return;
  if (!getRes.ok) {
    throw new Error(`Google Termin konnte nicht geladen werden: ${await getRes.text()}`);
  }
  const event = (await getRes.json()) as GoogleEventItem;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "cancelled",
        description: [event.description, AGENT_CREATED_DESCRIPTION]
          .filter(Boolean)
          .join("\n"),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Google Termin konnte nicht storniert werden: ${await res.text()}`
    );
  }
}
