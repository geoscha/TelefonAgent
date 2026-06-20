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
  LINKER_CALENDAR_LABEL,
  isAgentCreatedCalendarEvent,
  isCancelledCalendarEvent,
} from "./agent-labels";

const AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  "Calendars.ReadWrite",
];

export function microsoftAuthUrl(state: string, redirectUriValue: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    redirect_uri: redirectUriValue,
    response_type: "code",
    scope: SCOPES.join(" "),
    response_mode: "query",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function microsoftExchangeCode(
  code: string,
  redirectUriValue: string
): Promise<Partial<CalendarConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      redirect_uri: redirectUriValue,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft Token-Austausch fehlgeschlagen: ${await res.text()}`
    );
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const email = await microsoftEmail(tok.access_token);
  return {
    connected: true,
    accountLabel: email,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    connectedAt: new Date().toISOString(),
  };
}

async function microsoftEmail(
  accessToken: string
): Promise<string | undefined> {
  try {
    const r = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    return j.mail ?? j.userPrincipalName;
  } catch {
    return undefined;
  }
}

async function microsoftAccessToken(ctx: CalendarContext): Promise<string> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accessToken) {
    throw new Error("Microsoft Kalender ist nicht verbunden.");
  }
  if (conn.expiresAt && conn.expiresAt > Date.now() + 60_000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken) return conn.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft Token-Refresh fehlgeschlagen: ${await res.text()}`
    );
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  await ctx.save({
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  });
  return tok.access_token;
}

export async function microsoftCreateEvent(
  input: CalendarEventInput,
  ctx: CalendarContext
): Promise<CreatedEvent> {
  const token = await microsoftAccessToken(ctx);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: input.title,
      body: { contentType: "text", content: input.description ?? "" },
      location: input.location ? { displayName: input.location } : undefined,
      start: { dateTime: input.startIso, timeZone: input.timeZone ?? DEFAULT_TZ },
      end: { dateTime: input.endIso, timeZone: input.timeZone ?? DEFAULT_TZ },
      categories: input.categories ?? ["Linker"],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft Termin anlegen fehlgeschlagen: ${await res.text()}`
    );
  }
  const j = (await res.json()) as { id: string; webLink?: string };
  return { id: j.id, htmlLink: j.webLink };
}

type MicrosoftEventItem = {
  id?: string;
  subject?: string;
  body?: { content?: string };
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  categories?: string[];
  isCancelled?: boolean;
};

function mapMicrosoftListedEvent(item: MicrosoftEventItem): ListedCalendarEvent | null {
  const id = item.id?.trim();
  const startIso = item.start?.dateTime;
  if (!id || !startIso) return null;

  const title = item.subject?.trim() || "Termin";
  if (item.isCancelled || isCancelledCalendarEvent(title)) return null;

  const description = item.body?.content;
  const agentCreated =
    item.categories?.includes(LINKER_CALENDAR_LABEL) ||
    isAgentCreatedCalendarEvent(title, description);

  return {
    id,
    title,
    description,
    startIso: new Date(startIso).toISOString(),
    endIso: item.end?.dateTime
      ? new Date(item.end.dateTime).toISOString()
      : startIso,
    agentCreated,
  };
}

export async function microsoftListEventsInRange(
  rangeStartIso: string,
  rangeEndIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const token = await microsoftAccessToken(ctx);
  const params = new URLSearchParams({
    startDateTime: new Date(rangeStartIso).toISOString(),
    endDateTime: new Date(rangeEndIso).toISOString(),
    $select: "id,subject,body,start,end,categories,isCancelled",
    $orderby: "start/dateTime",
  });

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(
      `Microsoft Kalender konnte nicht gelesen werden: ${await res.text()}`
    );
  }

  const data = (await res.json()) as { value?: MicrosoftEventItem[] };
  return (data.value ?? [])
    .map(mapMicrosoftListedEvent)
    .filter((event): event is ListedCalendarEvent => event !== null);
}

export async function microsoftListEventsOnDay(
  dayIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const start = `${dayIso}T00:00:00`;
  const endDate = new Date(`${dayIso}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString().slice(0, 19);
  return microsoftListEventsInRange(start, end, ctx);
}

export async function microsoftDeleteEvent(
  eventId: string,
  ctx: CalendarContext
): Promise<void> {
  const token = await microsoftAccessToken(ctx);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (res.status === 404 || res.status === 204) return;
  if (!res.ok) {
    throw new Error(
      `Microsoft Termin konnte nicht gelöscht werden: ${await res.text()}`
    );
  }
}

export async function microsoftRescheduleEvent(
  input: {
    eventId: string;
    startIso: string;
    endIso: string;
  },
  ctx: CalendarContext
): Promise<void> {
  const token = await microsoftAccessToken(ctx);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: input.startIso, timeZone: DEFAULT_TZ },
        end: { dateTime: input.endIso, timeZone: DEFAULT_TZ },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Microsoft Termin konnte nicht verschoben werden: ${await res.text()}`
    );
  }
}

export async function microsoftCancelEvent(
  eventId: string,
  ctx: CalendarContext
): Promise<void> {
  const token = await microsoftAccessToken(ctx);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: "Storniert via Linker" }),
    }
  );
  if (res.status === 404) return;
  if (!res.ok) {
    throw new Error(
      `Microsoft Termin konnte nicht storniert werden: ${await res.text()}`
    );
  }
}
