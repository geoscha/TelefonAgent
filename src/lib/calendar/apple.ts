import "server-only";

import { randomUUID } from "crypto";

import type { CalendarConnection } from "@/lib/store";
import type {
  CalendarContext,
  CalendarEventInput,
  CreatedEvent,
} from "./types";

const ICLOUD_ROOT = "https://caldav.icloud.com";

function basicAuth(appleId: string, appPassword: string): string {
  return "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64");
}

async function propfind(
  url: string,
  auth: string,
  depth: "0" | "1",
  body: string
): Promise<string> {
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
    redirect: "follow",
  });
  if (res.status === 401) {
    throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
  }
  if (res.status !== 207 && !res.ok) {
    throw new Error(`CalDAV-Anfrage fehlgeschlagen (${res.status}).`);
  }
  return res.text();
}

function absolutize(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = new URL(base).origin;
  return origin + href;
}

/**
 * Discovers the user's first writable iCloud calendar collection URL via the
 * standard CalDAV principal → calendar-home → calendar chain.
 */
async function discoverCalendarUrl(auth: string): Promise<string> {
  // 1) current-user-principal
  const principalXml = await propfind(
    `${ICLOUD_ROOT}/`,
    auth,
    "0",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`
  );
  const principalHref = principalXml.match(
    /<current-user-principal>[\s\S]*?<href>([^<]+)<\/href>/i
  )?.[1];
  if (!principalHref) throw new Error("CalDAV-Principal nicht gefunden.");
  const principalUrl = absolutize(principalHref.trim(), ICLOUD_ROOT);

  // 2) calendar-home-set
  const homeXml = await propfind(
    principalUrl,
    auth,
    "0",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`
  );
  const homeHref = homeXml.match(
    /calendar-home-set[\s\S]*?<href>([^<]+)<\/href>/i
  )?.[1];
  if (!homeHref) throw new Error("CalDAV calendar-home-set nicht gefunden.");
  const homeUrl = absolutize(homeHref.trim(), principalUrl);

  // 3) list calendar collections and pick the first that supports VEVENT
  const listXml = await propfind(
    homeUrl,
    auth,
    "1",
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`
  );

  const responses = listXml.split(/<\/?response>/i);
  for (const block of responses) {
    if (!/calendar/i.test(block)) continue;
    if (!/VEVENT/i.test(block)) continue;
    const href = block.match(/<href>([^<]+)<\/href>/i)?.[1];
    if (href && !/inbox|outbox|notification/i.test(href)) {
      return absolutize(href.trim(), homeUrl);
    }
  }
  throw new Error("Kein beschreibbarer iCloud-Kalender gefunden.");
}

export async function appleConnect(
  appleId: string,
  appPassword: string,
  calendarUrl?: string
): Promise<Partial<CalendarConnection>> {
  const auth = basicAuth(appleId, appPassword);
  const url = calendarUrl?.trim() || (await discoverCalendarUrl(auth));
  return {
    connected: true,
    accountLabel: appleId,
    appPassword,
    caldavCalendarUrl: url,
    connectedAt: new Date().toISOString(),
  };
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function appleCreateEvent(
  input: CalendarEventInput,
  ctx: CalendarContext
): Promise<CreatedEvent> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }
  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const uid = randomUUID();
  const base = conn.caldavCalendarUrl.endsWith("/")
    ? conn.caldavCalendarUrl
    : conn.caldavCalendarUrl + "/";
  const eventUrl = `${base}${uid}.ics`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cura//Telefonagent//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(input.startIso)}`,
    `DTEND:${icsDate(input.endIso)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    input.description ? `DESCRIPTION:${escapeIcs(input.description)}` : "",
    input.location ? `LOCATION:${escapeIcs(input.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const res = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*",
    },
    body: ics,
    redirect: "follow",
  });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`Apple Termin anlegen fehlgeschlagen (${res.status}).`);
  }
  return { id: uid };
}
