import "server-only";

import { randomUUID } from "crypto";

import {
  AGENT_CALENDAR_SOURCE_LABEL,
  AGENT_CREATED_DESCRIPTION,
  buildAgentCancelledDescription,
  formatAgentCancelledTitle,
  isAgentCreatedCalendarEvent,
  isCancelledCalendarEvent,
} from "./agent-labels";
import type { CalendarConnection } from "@/lib/store";
import type {
  CalendarContext,
  CalendarEventInput,
  CreatedEvent,
  ListedCalendarEvent,
} from "./types";

const ICLOUD_ROOT = "https://caldav.icloud.com";
const ICLOUD_WELL_KNOWN = `${ICLOUD_ROOT}/.well-known/caldav`;

function normalizeAppPassword(value: string): string {
  return value.replace(/[\s-]/g, "");
}

function basicAuth(appleId: string, appPassword: string): string {
  return (
    "Basic " +
    Buffer.from(`${appleId}:${normalizeAppPassword(appPassword)}`).toString(
      "base64"
    )
  );
}

/** Extracts the first href nested inside a DAV property, ignoring XML namespaces. */
function extractDavHref(xml: string, property: string): string | null {
  const propPattern = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${property}(?:\\s[^>]*)?>[\\s\\S]*?<(?:[A-Za-z0-9]+:)?href(?:\\s[^>]*)?>([^<]+)</(?:[A-Za-z0-9]+:)?href>`,
    "i"
  );
  const nested = xml.match(propPattern)?.[1]?.trim();
  if (nested) return nested;

  // Some servers return the principal path only in the outer response href.
  const outerHref = xml.match(
    /<(?:[A-Za-z0-9]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i
  )?.[1];
  if (outerHref && /principal/i.test(outerHref)) {
    return outerHref.trim();
  }

  return null;
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
  if (href.startsWith("/")) {
    return new URL(href, base).toString();
  }
  return new URL(href, base.endsWith("/") ? base : `${base}/`).toString();
}

/**
 * Discovers the user's first writable iCloud calendar collection URL via the
 * standard CalDAV principal → calendar-home → calendar chain.
 */
const PRINCIPAL_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop><current-user-principal/></prop>
</propfind>`;

const CALENDAR_HOME_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <prop><c:calendar-home-set/></prop>
</propfind>`;

const CALENDAR_LIST_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <prop>
    <resourcetype/>
    <c:supported-calendar-component-set/>
  </prop>
</propfind>`;

const CALENDAR_VERIFY_PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop><resourcetype/></prop>
</propfind>`;

async function discoverPrincipalUrl(auth: string): Promise<string> {
  const roots = [`${ICLOUD_ROOT}/`, ICLOUD_WELL_KNOWN];
  for (const root of roots) {
    const principalXml = await propfind(root, auth, "0", PRINCIPAL_PROPFIND);
    const principalHref = extractDavHref(principalXml, "current-user-principal");
    if (principalHref) {
      return absolutize(principalHref, root);
    }
  }
  throw new Error("CalDAV-Principal nicht gefunden.");
}

async function discoverCalendarUrl(auth: string): Promise<string> {
  const principalUrl = await discoverPrincipalUrl(auth);

  const homeXml = await propfind(
    principalUrl,
    auth,
    "0",
    CALENDAR_HOME_PROPFIND
  );
  const homeHref = extractDavHref(homeXml, "calendar-home-set");
  if (!homeHref) {
    throw new Error("CalDAV calendar-home-set nicht gefunden.");
  }
  const homeUrl = absolutize(homeHref, principalUrl);

  const listXml = await propfind(homeUrl, auth, "1", CALENDAR_LIST_PROPFIND);

  const responses = listXml.split(/<\/?(?:[A-Za-z0-9]+:)?response>/i);
  for (const block of responses) {
    if (!/calendar/i.test(block)) continue;
    if (!/VEVENT/i.test(block)) continue;
    const href = block.match(
      /<(?:[A-Za-z0-9]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i
    )?.[1];
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
  const normalizedPassword = normalizeAppPassword(appPassword);
  const auth = basicAuth(appleId, normalizedPassword);
  const url = calendarUrl?.trim() || (await discoverCalendarUrl(auth));

  // Verify we can reach the chosen calendar collection before saving credentials.
  await propfind(url, auth, "0", CALENDAR_VERIFY_PROPFIND);

  return {
    connected: true,
    accountLabel: appleId,
    appPassword: normalizedPassword,
    caldavCalendarUrl: url,
    connectedAt: new Date().toISOString(),
  };
}

function icsUtcDateTime(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsLocalDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

function icsTextLine(name: string, value: string): string {
  const escaped = escapeIcs(value);
  const property = /[^\x00-\x7F]/.test(value) ? `${name};CHARSET=UTF-8` : name;
  return foldIcsLine(`${property}:${escaped}`);
}

function summarizeCalDavError(status: number, body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return trimmed ? `Apple Termin anlegen fehlgeschlagen (${status}): ${trimmed}` : `Apple Termin anlegen fehlgeschlagen (${status}).`;
}

function buildAppleEventIcs(input: CalendarEventInput, uid: string): string {
  const timeZone = input.timeZone ?? "Europe/Zurich";
  const now = icsUtcDateTime(new Date().toISOString());
  const title = input.title.trim() || "Termin";
  const description = input.description?.trim() || AGENT_CREATED_DESCRIPTION;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cura//Telefonagent//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
    `CREATED:${now}`,
    `DTSTART;TZID=${timeZone}:${icsLocalDateTime(input.startIso, timeZone)}`,
    `DTEND;TZID=${timeZone}:${icsLocalDateTime(input.endIso, timeZone)}`,
    icsTextLine("SUMMARY", title),
    icsTextLine("DESCRIPTION", description),
    icsTextLine("CATEGORIES", AGENT_CALENDAR_SOURCE_LABEL),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    ...(input.location ? [icsTextLine("LOCATION", input.location)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

async function createAppleEventResource(
  eventUrl: string,
  calendarUrl: string,
  auth: string,
  ics: string
): Promise<void> {
  const putRes = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*",
    },
    body: ics,
    redirect: "follow",
  });

  if (putRes.ok || putRes.status === 201 || putRes.status === 204) {
    return;
  }

  if (putRes.status === 400 || putRes.status === 405) {
    const collectionUrl = calendarUrl.endsWith("/")
      ? calendarUrl
      : `${calendarUrl}/`;
    const postRes = await fetch(collectionUrl, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "text/calendar; charset=utf-8",
      },
      body: ics,
      redirect: "follow",
    });
    if (postRes.ok || postRes.status === 201 || postRes.status === 204) {
      return;
    }
    throw new Error(
      summarizeCalDavError(postRes.status, await postRes.text())
    );
  }

  throw new Error(summarizeCalDavError(putRes.status, await putRes.text()));
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
  const uid = `${randomUUID()}@cura-agent`;
  const base = conn.caldavCalendarUrl.endsWith("/")
    ? conn.caldavCalendarUrl
    : `${conn.caldavCalendarUrl}/`;
  const eventUrl = `${base}${encodeURIComponent(uid)}.ics`;
  const ics = buildAppleEventIcs(input, uid);

  await createAppleEventResource(
    eventUrl,
    conn.caldavCalendarUrl,
    auth,
    ics
  );

  return { id: uid };
}

function caldavDayRange(dayIso: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso.trim());
  if (!match) {
    throw new Error("Ungültiges Datum. Format: YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const startLocal = new Date(year, month, day, 0, 0, 0);
  const endLocal = new Date(year, month, day + 1, 0, 0, 0);
  const fmt = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  return { start: fmt(startLocal), end: fmt(endLocal) };
}

function parseIcsField(block: string, field: string): string | undefined {
  const match = block.match(new RegExp(`^${field}[^:]*:(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parseIcsDate(value: string): string {
  const cleaned = value.replace(/;[^:]*:/, ":");
  if (/^\d{8}T\d{6}Z$/i.test(cleaned)) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    const hh = cleaned.slice(9, 11);
    const mm = cleaned.slice(11, 13);
    const ss = cleaned.slice(13, 15);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  if (/^\d{8}$/i.test(cleaned)) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return new Date(`${y}-${m}-${d}T12:00:00`).toISOString();
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? cleaned : parsed.toISOString();
}

async function calendarQuery(
  calendarUrl: string,
  auth: string,
  dayIso: string
): Promise<string> {
  const { start, end } = caldavDayRange(dayIso);
  const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${start}" end="${end}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const res = await fetch(calendarUrl, {
    method: "REPORT",
    headers: {
      Authorization: auth,
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
    redirect: "follow",
  });

  if (res.status === 401) {
    throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV-Abfrage fehlgeschlagen (${res.status}).`);
  }
  return res.text();
}

function parseListedEvents(xml: string, homeUrl: string): ListedCalendarEvent[] {
  const events: ListedCalendarEvent[] = [];
  const responses = xml.split(/<\/?(?:[A-Za-z0-9]+:)?response>/i);

  for (const block of responses) {
    const href = block.match(
      /<(?:[A-Za-z0-9]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i
    )?.[1];
    const calendarData = block.match(
      /<(?:[A-Za-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?calendar-data>/i
    )?.[1];
    if (!calendarData) continue;

    const ics = calendarData
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const vevent = ics.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
    if (!vevent) continue;

    const uid = parseIcsField(vevent, "UID");
    const summary = parseIcsField(vevent, "SUMMARY");
    const description = parseIcsField(vevent, "DESCRIPTION");
    const status = parseIcsField(vevent, "STATUS");
    const dtstart = parseIcsField(vevent, "DTSTART");
    if (!uid || !summary || !dtstart) continue;

    const title = summary.replace(/\\n/g, "\n").replace(/\\,/g, ",");
    const normalizedDescription = description
      ?.replace(/\\n/g, "\n")
      .replace(/\\,/g, ",");
    const eventUrl = href ? absolutize(href.trim(), homeUrl) : undefined;
    events.push({
      id: uid,
      title,
      description: normalizedDescription,
      startIso: parseIcsDate(dtstart),
      eventUrl,
      cancelled: isCancelledCalendarEvent(title, status),
      agentCreated: isAgentCreatedCalendarEvent(title, normalizedDescription),
    });
  }

  return events;
}

export async function appleListEventsOnDay(
  dayIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }
  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const xml = await calendarQuery(conn.caldavCalendarUrl, auth, dayIso);
  return parseListedEvents(xml, conn.caldavCalendarUrl);
}

export async function appleCancelEvent(
  eventId: string,
  ctx: CalendarContext,
  eventUrl?: string
): Promise<void> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }
  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const base = conn.caldavCalendarUrl.endsWith("/")
    ? conn.caldavCalendarUrl
    : `${conn.caldavCalendarUrl}/`;
  const target =
    eventUrl?.trim() ||
    `${base}${eventId.replace(/\.ics$/i, "")}.ics`;

  const getRes = await fetch(target, {
    method: "GET",
    headers: { Authorization: auth },
    redirect: "follow",
  });

  if (getRes.status === 401) {
    throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
  }
  if (!getRes.ok) {
    throw new Error(`Apple Termin konnte nicht geladen werden (${getRes.status}).`);
  }

  const existingIcs = await getRes.text();
  const updatedIcs = markAppleEventCancelled(existingIcs);
  const etag = getRes.headers.get("etag") ?? undefined;

  const putRes = await fetch(target, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "text/calendar; charset=utf-8",
      ...(etag ? { "If-Match": etag } : {}),
    },
    body: updatedIcs,
    redirect: "follow",
  });

  if (putRes.status === 401) {
    throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
  }
  if (!putRes.ok && putRes.status !== 201 && putRes.status !== 204) {
    throw new Error(`Apple Termin konnte nicht als abgesagt markiert werden (${putRes.status}).`);
  }
}

function upsertIcsField(block: string, field: string, value: string): string {
  const escaped = escapeIcs(value);
  const line = `${field}:${escaped}`;
  const pattern = new RegExp(`^${field}[^:]*:.*$`, "im");
  if (pattern.test(block)) {
    return block.replace(pattern, line);
  }
  return `${block}\r\n${line}`;
}

function markAppleEventCancelled(ics: string): string {
  const veventMatch = ics.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  if (!veventMatch) {
    throw new Error("Kalendereintrag konnte nicht gelesen werden.");
  }

  const vevent = veventMatch[1];
  const summary = parseIcsField(vevent, "SUMMARY") ?? "Termin";
  const description = parseIcsField(vevent, "DESCRIPTION");
  const cancelledAt = new Date().toISOString();

  let updated = vevent;
  updated = upsertIcsField(updated, "SUMMARY", formatAgentCancelledTitle(summary));
  updated = upsertIcsField(
    updated,
    "DESCRIPTION",
    buildAgentCancelledDescription(
      description?.replace(/\\n/g, "\n").replace(/\\,/g, ","),
      cancelledAt
    )
  );
  updated = upsertIcsField(updated, "STATUS", "CANCELLED");
  updated = upsertIcsField(updated, "TRANSP", "TRANSPARENT");
  updated = upsertIcsField(updated, "DTSTAMP", icsUtcDateTime(cancelledAt));
  updated = upsertIcsField(updated, "CATEGORIES", AGENT_CALENDAR_SOURCE_LABEL);

  return ics.replace(veventMatch[0], `BEGIN:VEVENT${updated}\r\nEND:VEVENT`);
}
