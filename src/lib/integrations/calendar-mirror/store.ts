import "server-only";

import type { ListedCalendarEvent } from "@/lib/calendar/types";
import type { CalendarProvider } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToEvent(row: any): ListedCalendarEvent {
  return {
    id: row.external_id,
    title: row.title ?? "",
    description: row.description ?? undefined,
    startIso: row.start_at,
    endIso: row.end_at ?? undefined,
    eventUrl: row.event_url ?? undefined,
    cancelled: Boolean(row.cancelled),
    agentCreated: Boolean(row.agent_created),
  };
}

function eventToRow(
  userId: string,
  provider: CalendarProvider,
  event: ListedCalendarEvent,
  syncedAt: string
): Record<string, unknown> {
  return {
    user_id: userId,
    provider,
    external_id: event.id,
    event_url: event.eventUrl ?? null,
    title: event.title ?? null,
    description: event.description ?? null,
    start_at: event.startIso,
    end_at: event.endIso ?? null,
    cancelled: Boolean(event.cancelled),
    agent_created: Boolean(event.agentCreated),
    synced_at: syncedAt,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Replace the whole event mirror for a user with a fresh window of events
 * pulled from the connected calendar. Service-role; scope by explicit userId.
 */
export async function replaceCalendarMirror(
  userId: string,
  provider: CalendarProvider,
  events: ListedCalendarEvent[]
): Promise<number> {
  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();

  await admin.from("calendar_events").delete().eq("user_id", userId);

  const rows = events
    .filter((event) => event.id && event.startIso)
    .map((event) => eventToRow(userId, provider, event, syncedAt));

  if (rows.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await admin
        .from("calendar_events")
        .upsert(slice, { onConflict: "user_id,provider,external_id" });
      if (error) throw error;
    }
  }

  await setCalendarMirrorSyncedAt(userId, syncedAt);
  return rows.length;
}

/** Upsert a single mirrored event (used right after a live booking). */
export async function upsertCalendarMirrorEvent(
  userId: string,
  provider: CalendarProvider,
  event: ListedCalendarEvent
): Promise<void> {
  if (!event.id || !event.startIso) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("calendar_events")
    .upsert(eventToRow(userId, provider, event, new Date().toISOString()), {
      onConflict: "user_id,provider,external_id",
    });
  if (error) throw error;
}

/**
 * Patch title/timing of a mirrored event without touching other fields
 * (preserves agent_created). Used right after a live reschedule/edit.
 */
export async function updateCalendarMirrorEvent(
  userId: string,
  provider: CalendarProvider,
  externalId: string,
  patch: { title?: string; startIso?: string; endIso?: string }
): Promise<void> {
  if (!externalId) return;
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.startIso !== undefined) row.start_at = patch.startIso;
  if (patch.endIso !== undefined) row.end_at = patch.endIso;
  if (Object.keys(row).length === 0) return;

  const admin = createAdminClient();
  await admin
    .from("calendar_events")
    .update(row)
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("external_id", externalId);
}

/** Flag a mirrored event as cancelled (used right after a live cancellation). */
export async function markCalendarMirrorCancelled(
  userId: string,
  provider: CalendarProvider,
  externalId: string
): Promise<void> {
  if (!externalId) return;
  const admin = createAdminClient();
  await admin
    .from("calendar_events")
    .update({ cancelled: true })
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("external_id", externalId);
}

/**
 * Mirrored events that intersect the given local calendar day, matching the
 * semantics of the live provider day listing. Filtering by the target time
 * zone is done in JS to stay correct across DST.
 */
export async function readCalendarMirrorDay(
  userId: string,
  dayIso: string,
  timeZone: string
): Promise<ListedCalendarEvent[]> {
  const admin = createAdminClient();

  // Generous UTC window (±18h) around the local day, then filter precisely.
  const dayStartUtc = new Date(`${dayIso}T00:00:00Z`).getTime();
  const lowerIso = new Date(dayStartUtc - 18 * 3_600_000).toISOString();
  const upperIso = new Date(dayStartUtc + 42 * 3_600_000).toISOString();

  const { data } = await admin
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .gte("start_at", lowerIso)
    .lte("start_at", upperIso)
    .order("start_at", { ascending: true });

  return (data ?? [])
    .map(rowToEvent)
    .filter((event) => localDateIso(event.startIso, timeZone) === dayIso);
}

/** All mirrored events whose start falls within the given range. */
export async function readCalendarMirrorRange(
  userId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<ListedCalendarEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .gte("start_at", rangeStartIso)
    .lte("start_at", rangeEndIso)
    .order("start_at", { ascending: true });

  return (data ?? []).map(rowToEvent);
}

function localDateIso(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export async function getCalendarMirrorSyncedAt(
  userId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("calendar_mirror_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.calendar_mirror_synced_at as string | null) ?? null;
}

export async function setCalendarMirrorSyncedAt(
  userId: string,
  iso: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("app_settings")
    .upsert({ user_id: userId, calendar_mirror_synced_at: iso }, {
      onConflict: "user_id",
    });
}
