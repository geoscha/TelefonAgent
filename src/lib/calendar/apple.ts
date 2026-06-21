import "server-only";

import { randomUUID } from "crypto";

import {
  AGENT_CALENDAR_SOURCE_LABEL,
  AGENT_CREATED_DESCRIPTION,
  buildAgentCancelledDescription,
  LINKER_CALENDAR_LABEL,
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
const CALDAV_FETCH_TIMEOUT_MS = 12_000;
const WRITABLE_URL_CACHE_TTL_MS = 15 * 60_000;
const DAY_EVENTS_CACHE_TTL_MS = 45_000;

const writableUrlCache = new Map<string, { urls: string[]; expiresAt: number }>();
const dayEventsCache = new Map<
  string,
  { events: ListedCalendarEvent[]; expiresAt: number }
>();

function connectionCacheKey(conn: CalendarConnection): string {
  return `${conn.accountLabel ?? ""}:${conn.caldavCalendarUrl ?? ""}`;
}

function invalidateDayEventsCache(conn: CalendarConnection, dayIso?: string): void {
  const prefix = `${connectionCacheKey(conn)}:`;
  for (const key of Array.from(dayEventsCache.keys())) {
    if (key.startsWith(prefix) && (!dayIso || key.endsWith(`:${dayIso}`))) {
      dayEventsCache.delete(key);
    }
  }
}

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
    signal: AbortSignal.timeout(CALDAV_FETCH_TIMEOUT_MS),
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
    <current-user-privilege-set/>
    <displayname/>
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

function calendarHrefIsExcluded(href: string): boolean {
  return /inbox|outbox|notification|birthday|holiday|subscribe|suggest|feiertag/i.test(
    href
  );
}

function calendarHomePath(homeUrl: string): string {
  return new URL(homeUrl).pathname.replace(/\/$/, "");
}

/** True when the URL is the calendar-home collection itself (PUT here returns 400). */
function isAppleCalendarHomeUrl(
  calendarUrl: string,
  homeUrl?: string
): boolean {
  try {
    const path = new URL(calendarUrl).pathname.replace(/\/$/, "");
    if (/\/calendars$/i.test(path)) return true;
    if (homeUrl) {
      return path === calendarHomePath(homeUrl);
    }
    return false;
  } catch {
    return /\/calendars\/?$/i.test(calendarUrl);
  }
}

function calendarCollectionSegment(
  href: string,
  homeUrl: string
): string | null {
  const homePath = calendarHomePath(homeUrl);
  const path = (/^https?:\/\//i.test(href)
    ? new URL(href).pathname
    : href
  ).replace(/\/$/, "");

  if (path === homePath) return null;

  const match = path.match(/\/calendars\/([^/]+)$/i);
  if (!match) return null;

  const segment = match[1].toLowerCase();
  if (segment === "inbox" || segment === "outbox" || segment === "notification") {
    return null;
  }
  return match[1];
}

function calendarBlockIsWritable(block: string): boolean {
  return (
    /<(?:[A-Za-z0-9]+:)?write-content\b/i.test(block) ||
    /<(?:[A-Za-z0-9]+:)?write\b/i.test(block)
  );
}

function calendarDisplayName(block: string): string | undefined {
  return block
    .match(
      /<(?:[A-Za-z0-9]+:)?displayname[^>]*>([^<]*)<\/(?:[A-Za-z0-9]+:)?displayname>/i
    )?.[1]
    ?.trim();
}

function calendarSortScore(href: string, displayName?: string): number {
  const haystack = `${href} ${displayName ?? ""}`.toLowerCase();
  if (/\/calendars\/home\/?$/i.test(href) || haystack.includes("privat")) {
    return 0;
  }
  if (haystack.includes("arbeit") || /\/calendars\/work\/?$/i.test(href)) {
    return 4;
  }
  return 2;
}

function parseWritableCalendarUrls(
  listXml: string,
  homeUrl: string
): string[] {
  const candidates: Array<{ url: string; score: number }> = [];
  const responses = listXml.split(/<\/?(?:[A-Za-z0-9]+:)?response>/i);
  for (const block of responses) {
    if (!/calendar/i.test(block)) continue;
    if (!/VEVENT/i.test(block)) continue;
    const href = block.match(
      /<(?:[A-Za-z0-9]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i
    )?.[1];
    if (!href || calendarHrefIsExcluded(href)) continue;
    if (!calendarCollectionSegment(href, homeUrl)) continue;
    if (!calendarBlockIsWritable(block)) continue;

    const displayName = calendarDisplayName(block);
    candidates.push({
      url: absolutize(href.trim(), homeUrl),
      score: calendarSortScore(href, displayName),
    });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.map((candidate) => candidate.url);
}

async function discoverWritableCalendarUrls(auth: string): Promise<string[]> {
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
  const urls = parseWritableCalendarUrls(listXml, homeUrl);
  if (urls.length === 0) {
    throw new Error("Kein beschreibbarer iCloud-Kalender gefunden.");
  }
  return urls;
}

async function discoverCalendarUrl(auth: string): Promise<string> {
  const urls = await discoverWritableCalendarUrls(auth);
  const work = urls.find((url) => /\/work\/?$/i.test(url));
  return work ?? urls[0];
}

function normalizeCalendarCollectionUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isLocalDefaultCalendarUrl(url: string): boolean {
  const haystack = url.toLowerCase();
  return (
    /\/calendars\/home\/?$/i.test(url) ||
    haystack.includes("privat") ||
    haystack.includes("/home/")
  );
}

/** Connected integration calendar + local default (Privat/Home), when they differ. */
async function resolveAppleWriteTargets(
  conn: CalendarConnection,
  auth: string
): Promise<string[]> {
  const allWritable = await discoverWritableCalendarUrls(auth);
  const connected = conn.caldavCalendarUrl?.trim();
  const normalizedConnected =
    connected && !isAppleCalendarHomeUrl(connected)
      ? normalizeCalendarCollectionUrl(connected)
      : null;

  const localUrl =
    allWritable.find((url) => isLocalDefaultCalendarUrl(url)) ?? allWritable[0];

  const targets: string[] = [];
  if (normalizedConnected) targets.push(normalizedConnected);
  if (localUrl) {
    const normalizedLocal = normalizeCalendarCollectionUrl(localUrl);
    if (!targets.includes(normalizedLocal)) targets.push(normalizedLocal);
  }

  return targets.length > 0 ? targets : allWritable;
}

function calendarHomeUrlFromCollection(calendarUrl: string): string {
  const trimmed = calendarUrl.trim();
  if (isAppleCalendarHomeUrl(trimmed)) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return trimmed.replace(/\/[^/]+\/?$/, "/");
}

async function writableCalendarUrlsForConnection(
  conn: CalendarConnection,
  auth: string
): Promise<string[]> {
  const cacheKey = connectionCacheKey(conn);
  const cached = writableUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.urls;
  }

  let urls: string[];

  if (!conn.caldavCalendarUrl) {
    urls = await discoverWritableCalendarUrls(auth);
  } else {
    try {
      const homeUrl = calendarHomeUrlFromCollection(conn.caldavCalendarUrl);
      const listXml = await propfind(homeUrl, auth, "1", CALENDAR_LIST_PROPFIND);
      urls = parseWritableCalendarUrls(listXml, homeUrl);
      if (urls.length === 0) {
        urls = [conn.caldavCalendarUrl];
      }
    } catch {
      urls = [conn.caldavCalendarUrl];
    }
  }

  writableUrlCache.set(cacheKey, {
    urls,
    expiresAt: Date.now() + WRITABLE_URL_CACHE_TTL_MS,
  });
  return urls;
}

/** Slot checks scan all writable calendars — busy events may live in Arbeit, Privat, etc. */
async function calendarUrlsForAvailabilityCheck(
  conn: CalendarConnection,
  auth: string
): Promise<string[]> {
  return writableCalendarUrlsForConnection(conn, auth);
}

async function queryListedEventsFromCalendars(
  calendarUrls: string[],
  auth: string,
  query: (calendarUrl: string) => Promise<string>,
  homeUrl: string,
  rangeStart?: Date,
  rangeEnd?: Date
): Promise<ListedCalendarEvent[]> {
  const batches = await Promise.allSettled(
    calendarUrls.map(async (calendarUrl) => {
      const xml = await query(calendarUrl);
      return parseListedEvents(xml, homeUrl || calendarUrl, rangeStart, rangeEnd);
    })
  );

  const merged: ListedCalendarEvent[][] = [];
  const failures: string[] = [];

  for (const result of batches) {
    if (result.status === "fulfilled") {
      merged.push(result.value);
      continue;
    }
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : "Kalenderabfrage fehlgeschlagen.";
    failures.push(message);
  }

  const events = mergeListedEvents(merged);
  if (events.length > 0 || failures.length === 0) {
    return events;
  }

  throw new Error(failures[0] ?? "Kalender konnte nicht gelesen werden.");
}

function mergeListedEvents(
  batches: ListedCalendarEvent[][]
): ListedCalendarEvent[] {
  const seen = new Set<string>();
  const merged: ListedCalendarEvent[] = [];

  for (const events of batches) {
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
  }

  return merged;
}

export async function appleConnect(
  appleId: string,
  appPassword: string,
  calendarUrl?: string
): Promise<Partial<CalendarConnection>> {
  const normalizedPassword = normalizeAppPassword(appPassword);
  const auth = basicAuth(appleId, normalizedPassword);
  const url = calendarUrl?.trim() || (await discoverCalendarUrl(auth));
  if (isAppleCalendarHomeUrl(url)) {
    throw new Error(
      "Kein beschreibbarer iCloud-Kalender gefunden. Bitte erneut verbinden."
    );
  }

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
  return foldIcsLine(`${name}:${escapeIcs(value)}`);
}

function summarizeCalDavError(status: number, body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return trimmed
    ? `Apple Termin anlegen fehlgeschlagen (${status}): ${trimmed}`
    : `Apple Termin anlegen fehlgeschlagen (${status}).`;
}

const ZURICH_VTIMEZONE_BLOCK = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Zurich",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function buildAppleEventIcs(
  input: CalendarEventInput,
  uid: string,
  mode: "tzid" | "utc" = "tzid"
): string {
  const timeZone = input.timeZone ?? "Europe/Zurich";
  const now = icsUtcDateTime(new Date().toISOString());
  const title = input.title.trim() || "Termin";
  const description = input.description?.trim() || AGENT_CREATED_DESCRIPTION;

  const startValue =
    mode === "utc"
      ? `DTSTART:${icsUtcDateTime(input.startIso)}`
      : `DTSTART;TZID=${timeZone}:${icsLocalDateTime(input.startIso, timeZone)}`;
  const endValue =
    mode === "utc"
      ? `DTEND:${icsUtcDateTime(input.endIso)}`
      : `DTEND;TZID=${timeZone}:${icsLocalDateTime(input.endIso, timeZone)}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Linker//Telefonagent//DE",
    "CALSCALE:GREGORIAN",
    ...(mode === "tzid" ? ZURICH_VTIMEZONE_BLOCK : []),
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `LAST-MODIFIED:${now}`,
    startValue,
    endValue,
    icsTextLine("SUMMARY", title),
    icsTextLine("DESCRIPTION", description),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    ...(input.location ? [icsTextLine("LOCATION", input.location)] : []),
    ...(input.categories?.length
      ? [icsTextLine("CATEGORIES", input.categories.join(","))]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

async function putAppleEvent(
  eventUrl: string,
  auth: string,
  ics: string,
  options?: { ifNoneMatch?: boolean }
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "text/calendar; charset=utf-8",
  };
  if (options?.ifNoneMatch) {
    headers["If-None-Match"] = "*";
  }

  return fetch(eventUrl, {
    method: "PUT",
    headers,
    body: ics,
    redirect: "follow",
  });
}

function putSucceeded(status: number): boolean {
  return status === 200 || status === 201 || status === 204;
}

async function createAppleEventResource(
  eventUrl: string,
  auth: string,
  input: CalendarEventInput,
  uid: string
): Promise<void> {
  const variants: Array<{ mode: "tzid" | "utc"; ifNoneMatch: boolean }> = [
    { mode: "tzid", ifNoneMatch: true },
    { mode: "tzid", ifNoneMatch: false },
    { mode: "utc", ifNoneMatch: false },
  ];

  let lastStatus = 0;
  let lastBody = "";

  for (const variant of variants) {
    const ics = buildAppleEventIcs(input, uid, variant.mode);
    const res = await putAppleEvent(eventUrl, auth, ics, {
      ifNoneMatch: variant.ifNoneMatch,
    });
    if (putSucceeded(res.status)) return;

    lastStatus = res.status;
    lastBody = await res.text();
  }

  throw new Error(summarizeCalDavError(lastStatus, lastBody));
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

  let calendarUrl = conn.caldavCalendarUrl;
  if (isAppleCalendarHomeUrl(calendarUrl)) {
    calendarUrl = await discoverCalendarUrl(auth);
    await ctx.save({ caldavCalendarUrl: calendarUrl });
  }

  const attemptCreate = async (targetUrl: string) => {
    const base = targetUrl.endsWith("/") ? targetUrl : `${targetUrl}/`;
    const eventUrl = `${base}${uid}.ics`;
    await createAppleEventResource(eventUrl, auth, input, uid);
  };

  const writeTargets = await resolveAppleWriteTargets(
    { ...conn, caldavCalendarUrl: calendarUrl },
    auth
  );
  const connectedTarget =
    calendarUrl && !isAppleCalendarHomeUrl(calendarUrl)
      ? normalizeCalendarCollectionUrl(calendarUrl)
      : null;

  const writtenUrls: string[] = [];
  let connectedWritten = false;
  let lastError: unknown;

  for (const targetUrl of writeTargets) {
    try {
      await attemptCreate(targetUrl);
      const normalizedTarget = normalizeCalendarCollectionUrl(targetUrl);
      writtenUrls.push(normalizedTarget);
      if (connectedTarget && normalizedTarget === connectedTarget) {
        connectedWritten = true;
      }
    } catch (error) {
      lastError = error;
      console.warn("[apple] event create failed for calendar", {
        targetUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (connectedTarget && !connectedWritten) {
    throw lastError instanceof Error
      ? lastError
      : new Error(
          "Termin konnte im verbundenen iCloud-Kalender nicht eingetragen werden."
        );
  }

  if (writtenUrls.length === 0) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Termin konnte in keinem iCloud-Kalender eingetragen werden.");
  }

  if (connectedWritten && connectedTarget) {
    await ctx.save({ caldavCalendarUrl: connectedTarget });
  }

  const dayIso = input.startIso.slice(0, 10);
  invalidateDayEventsCache(conn, dayIso);
  return { id: uid, calendarUrls: writtenUrls };
}

function formatCalDavUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function zurichUtcOffset(month: number): string {
  return month >= 3 && month <= 10 ? "+02:00" : "+01:00";
}

function caldavDayRange(dayIso: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso.trim());
  if (!match) {
    throw new Error("Ungültiges Datum. Format: YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const nextIso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;

  const start = new Date(
    `${match[1]}-${match[2]}-${match[3]}T00:00:00${zurichUtcOffset(month)}`
  );
  const end = new Date(
    `${nextIso}T00:00:00${zurichUtcOffset(Number(nextIso.slice(5, 7)))}`
  );

  return {
    start: formatCalDavUtc(start),
    end: formatCalDavUtc(end),
  };
}

function isLinkerManagedEvent(
  title: string,
  description: string | undefined,
  categories?: string
): boolean {
  const normalizedCategories = categories?.toLowerCase() ?? "";
  return (
    isAgentCreatedCalendarEvent(title, description) ||
    normalizedCategories.includes(LINKER_CALENDAR_LABEL.toLowerCase()) ||
    normalizedCategories.includes("linker agent") ||
    normalizedCategories.includes("cura agent")
  );
}

async function calendarQueryRange(
  calendarUrl: string,
  auth: string,
  rangeStart: string,
  rangeEnd: string
): Promise<string> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${rangeStart}" end="${rangeEnd}"/>
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
    signal: AbortSignal.timeout(CALDAV_FETCH_TIMEOUT_MS),
  });

  if (res.status === 401) {
    throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV-Abfrage fehlgeschlagen (${res.status}).`);
  }
  return res.text();
}

async function calendarQuery(
  calendarUrl: string,
  auth: string,
  dayIso: string
): Promise<string> {
  const { start, end } = caldavDayRange(dayIso);
  return calendarQueryRange(calendarUrl, auth, start, end);
}

function unfoldIcsBlock(block: string): string {
  return block
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.trimStart();
      } else {
        lines.push(line);
      }
      return lines;
    }, [] as string[])
    .join("\n");
}

function parseIcsField(block: string, field: string): string | undefined {
  const unfolded = unfoldIcsBlock(block);
  const match = unfolded.match(new RegExp(`^${field}[^:]*:(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parseIcsDateValue(raw: string, tzid?: string): string {
  const value = raw.trim();
  const monthFromValue = Number(value.slice(4, 6));
  const fallbackOffset = zurichUtcOffset(monthFromValue || 1);

  if (/^\d{8}T\d{6}Z$/i.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const mm = value.slice(11, 13);
    const ss = value.slice(13, 15);
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }

  const withOffset = value.match(/^(\d{8}T\d{6})([+-]\d{2}:?\d{2})$/i);
  if (withOffset) {
    const compact = withOffset[1];
    const y = compact.slice(0, 4);
    const m = compact.slice(4, 6);
    const d = compact.slice(6, 8);
    const hh = compact.slice(9, 11);
    const min = compact.slice(11, 13);
    const ss = compact.slice(13, 15);
    const offset = withOffset[2].includes(":")
      ? withOffset[2]
      : `${withOffset[2].slice(0, 3)}:${withOffset[2].slice(3)}`;
    return new Date(`${y}-${m}-${d}T${hh}:${min}:${ss}${offset}`).toISOString();
  }

  if (/^\d{8}T\d{6}$/i.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    const hh = value.slice(9, 11);
    const min = value.slice(11, 13);
    const ss = value.slice(13, 15);
    const offset =
      tzid === "Europe/Zurich" || !tzid
        ? fallbackOffset
        : fallbackOffset;
    return new Date(`${y}-${m}-${d}T${hh}:${min}:${ss}${offset}`).toISOString();
  }

  if (/^\d{8}$/i.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return new Date(`${y}-${m}-${d}T09:00:00${fallbackOffset}`).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function parseVeventInstant(vevent: string, field: string): string | undefined {
  const unfolded = unfoldIcsBlock(vevent);
  const match = unfolded.match(new RegExp(`^${field}([^:]*):(.+)$`, "im"));
  if (!match) return undefined;
  const tzid = match[1].match(/TZID=([^;:]+)/i)?.[1];
  return parseIcsDateValue(match[2].trim(), tzid);
}

function resolveEventResourceUrl(
  href: string | undefined,
  uid: string,
  homeUrl: string
): string | undefined {
  if (href?.trim()) {
    const absolute = absolutize(href.trim(), homeUrl);
    if (/\.ics$/i.test(absolute)) return absolute;
  }
  const base = homeUrl.endsWith("/") ? homeUrl : `${homeUrl}/`;
  return `${base}${uid.replace(/\.ics$/i, "")}.ics`;
}

function eventOverlapsRange(
  startIso: string,
  endIso: string | undefined,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso ?? startIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start < rangeEnd.getTime() && end > rangeStart.getTime();
}

function parseListedEvents(
  xml: string,
  homeUrl: string,
  rangeStart?: Date,
  rangeEnd?: Date
): ListedCalendarEvent[] {
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
    const veventRaw = ics.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
    if (!veventRaw) continue;
    const vevent = unfoldIcsBlock(veventRaw);

    const uid = parseIcsField(vevent, "UID");
    const summary = parseIcsField(vevent, "SUMMARY");
    const description = parseIcsField(vevent, "DESCRIPTION");
    const status = parseIcsField(vevent, "STATUS");
    const dtstart = parseVeventInstant(vevent, "DTSTART");
    const dtend = parseVeventInstant(vevent, "DTEND");
    const categories = parseIcsField(vevent, "CATEGORIES");
    if (!uid || !dtstart) continue;

    if (status?.toUpperCase() === "CANCELLED") continue;

    if (rangeStart && rangeEnd) {
      const endInstant = dtend ?? dtstart;
      if (!eventOverlapsRange(dtstart, endInstant, rangeStart, rangeEnd)) {
        continue;
      }
    }

    const title = (summary || "Termin").replace(/\\n/g, "\n").replace(/\\,/g, ",");
    const normalizedDescription = description
      ?.replace(/\\n/g, "\n")
      .replace(/\\,/g, ",");
    const eventUrl = resolveEventResourceUrl(href, uid, homeUrl);
    events.push({
      id: uid,
      title,
      description: normalizedDescription,
      startIso: dtstart,
      endIso: dtend ?? undefined,
      eventUrl,
      cancelled: isCancelledCalendarEvent(title, status),
      agentCreated: isLinkerManagedEvent(
        title,
        normalizedDescription,
        categories
      ),
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

  const dayCacheKey = `${connectionCacheKey(conn)}:${dayIso}`;
  const cachedDay = dayEventsCache.get(dayCacheKey);
  if (cachedDay && cachedDay.expiresAt > Date.now()) {
    return cachedDay.events;
  }

  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const calendarUrls = await calendarUrlsForAvailabilityCheck(conn, auth);
  const month = Number(dayIso.slice(5, 7));
  const nextDayIso = dayIso.replace(
    /^(\d{4})-(\d{2})-(\d{2})$/,
    (_, y, m, d) => {
      const anchor = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1, 12));
      return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
    }
  );
  const rangeStart = new Date(`${dayIso}T00:00:00${zurichUtcOffset(month)}`);
  const rangeEnd = new Date(
    `${nextDayIso}T00:00:00${zurichUtcOffset(Number(nextDayIso.slice(5, 7)))}`
  );
  const homeUrl = calendarUrls[0] ?? conn.caldavCalendarUrl;
  const events = await queryListedEventsFromCalendars(
    calendarUrls,
    auth,
    (calendarUrl) => calendarQuery(calendarUrl, auth, dayIso),
    homeUrl,
    rangeStart,
    rangeEnd
  ).then((listed) => listed.filter((event) => !event.cancelled));

  dayEventsCache.set(dayCacheKey, {
    events,
    expiresAt: Date.now() + DAY_EVENTS_CACHE_TTL_MS,
  });
  return events;
}

export async function appleListEventsInRange(
  rangeStartIso: string,
  rangeEndIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }

  const start = new Date(rangeStartIso);
  const end = new Date(rangeEndIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Ungültiger Zeitraum.");
  }
  if (end <= start) {
    throw new Error("Ende muss nach dem Start liegen.");
  }

  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const rangeStart = formatCalDavUtc(start);
  const rangeEnd = formatCalDavUtc(end);
  const calendarUrls = await calendarUrlsForAvailabilityCheck(conn, auth);
  const homeUrl = calendarUrls[0] ?? conn.caldavCalendarUrl;
  return queryListedEventsFromCalendars(
    calendarUrls,
    auth,
    (calendarUrl) => calendarQueryRange(calendarUrl, auth, rangeStart, rangeEnd),
    homeUrl,
    start,
    end
  ).then((events) => events.filter((event) => !event.cancelled));
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
  const target = resolveAppleEventUrl(eventId, conn.caldavCalendarUrl, eventUrl);
  const { ics, etag } = await fetchAppleEventResource(target, auth);
  const updatedIcs = markAppleEventCancelled(ics);

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

function resolveAppleEventUrl(
  eventId: string,
  caldavCalendarUrl: string,
  eventUrl?: string
): string {
  if (eventUrl?.trim()) return eventUrl.trim();
  const base = caldavCalendarUrl.endsWith("/")
    ? caldavCalendarUrl
    : `${caldavCalendarUrl}/`;
  return `${base}${eventId.replace(/\.ics$/i, "")}.ics`;
}

async function fetchAppleEventResource(
  target: string,
  auth: string
): Promise<{ ics: string; etag?: string }> {
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

  return {
    ics: await getRes.text(),
    etag: getRes.headers.get("etag") ?? undefined,
  };
}

function replaceIcsInstantLine(
  block: string,
  field: "DTSTART" | "DTEND",
  iso: string,
  fallbackTimeZone = "Europe/Zurich"
): string {
  const existing = block.match(new RegExp(`^${field}[^\\r\\n]*`, "im"))?.[0];
  if (!existing) {
    const line = `${field};TZID=${fallbackTimeZone}:${icsLocalDateTime(iso, fallbackTimeZone)}`;
    return `${block}\r\n${line}`;
  }

  const tzid = existing.match(/TZID=([^:;]+)/i)?.[1];
  const line = tzid
    ? `${field};TZID=${tzid}:${icsLocalDateTime(iso, tzid)}`
    : `${field}:${icsUtcDateTime(iso)}`;

  return block.replace(new RegExp(`^${field}[^\\r\\n]*`, "im"), line);
}

function rescheduleAppleEventIcs(
  ics: string,
  startIso: string,
  endIso: string,
  title?: string
): string {
  const veventMatch = ics.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  if (!veventMatch) {
    throw new Error("Kalendereintrag konnte nicht gelesen werden.");
  }

  const vevent = veventMatch[1];
  const sequence = Number(parseIcsField(vevent, "SEQUENCE") ?? "0");
  const modifiedAt = new Date().toISOString();

  let updated = vevent;
  updated = replaceIcsInstantLine(updated, "DTSTART", startIso);
  updated = replaceIcsInstantLine(updated, "DTEND", endIso);
  if (title !== undefined) {
    updated = upsertIcsField(updated, "SUMMARY", title);
  }
  updated = upsertIcsField(updated, "DTSTAMP", icsUtcDateTime(modifiedAt));
  updated = upsertIcsField(updated, "LAST-MODIFIED", icsUtcDateTime(modifiedAt));
  updated = upsertIcsField(updated, "SEQUENCE", String(sequence + 1));

  return ics.replace(veventMatch[0], `BEGIN:VEVENT${updated}\r\nEND:VEVENT`);
}

export async function appleDeleteEvent(
  eventId: string,
  ctx: CalendarContext,
  eventUrl?: string
): Promise<void> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }
  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const normalizedId = eventId.replace(/\.ics$/i, "");

  const targets = new Set<string>();
  if (eventUrl?.trim()) {
    targets.add(eventUrl.trim());
  }

  const writeTargets = await resolveAppleWriteTargets(conn, auth);
  for (const calendarUrl of writeTargets) {
    const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
    targets.add(`${base}${normalizedId}.ics`);
  }

  if (conn.caldavCalendarUrl) {
    targets.add(
      resolveAppleEventUrl(eventId, conn.caldavCalendarUrl, eventUrl)
    );
  }

  let deleted = 0;
  let missing = 0;
  const hardFailures: string[] = [];

  for (const target of Array.from(targets)) {
    const deleteRes = await fetch(target, {
      method: "DELETE",
      headers: { Authorization: auth },
      redirect: "follow",
    });

    if (deleteRes.status === 401) {
      throw new Error("Apple-ID oder App-spezifisches Passwort ist ungültig.");
    }
    if (deleteRes.status === 404) {
      missing += 1;
      continue;
    }
    if (deleteRes.ok || deleteRes.status === 204) {
      deleted += 1;
      continue;
    }
    if (deleteRes.status === 403 || deleteRes.status === 405) {
      hardFailures.push(`${target} (${deleteRes.status})`);
      continue;
    }
    hardFailures.push(`${target} (${deleteRes.status})`);
  }

  invalidateDayEventsCache(conn);

  if (deleted > 0 || (missing > 0 && hardFailures.length === 0)) {
    console.info("[apple] event deleted", {
      eventId: normalizedId,
      deleted,
      missing,
      targets: targets.size,
    });
    return;
  }

  if (hardFailures.length > 0) {
    console.warn("[apple] event delete failed on some calendars", {
      eventId: normalizedId,
      hardFailures,
    });
    throw new Error("Termin konnte nicht aus allen Kalendern gelöscht werden.");
  }

  throw new Error("Apple Termin konnte nicht gelöscht werden.");
}

export async function appleRescheduleEvent(
  input: {
    eventId: string;
    eventUrl?: string;
    startIso: string;
    endIso: string;
    title?: string;
  },
  ctx: CalendarContext
): Promise<void> {
  const conn = ctx.connection;
  if (!conn.connected || !conn.accountLabel || !conn.appPassword || !conn.caldavCalendarUrl) {
    throw new Error("Apple Kalender ist nicht verbunden.");
  }

  const start = new Date(input.startIso);
  const end = new Date(input.endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Ungültige Terminzeit.");
  }
  if (end <= start) {
    throw new Error("Ende muss nach dem Start liegen.");
  }

  const auth = basicAuth(conn.accountLabel, conn.appPassword);
  const target = resolveAppleEventUrl(
    input.eventId,
    conn.caldavCalendarUrl,
    input.eventUrl
  );
  const { ics, etag } = await fetchAppleEventResource(target, auth);
  const updatedIcs = rescheduleAppleEventIcs(
    ics,
    input.startIso,
    input.endIso,
    input.title
  );

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
  if (putRes.status === 403 || putRes.status === 405) {
    throw new Error("Dieser Termin kann in diesem Kalender nicht verschoben werden.");
  }
  if (!putRes.ok && putRes.status !== 201 && putRes.status !== 204) {
    throw new Error(`Apple Termin konnte nicht verschoben werden (${putRes.status}).`);
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
