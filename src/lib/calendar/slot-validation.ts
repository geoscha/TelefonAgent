import type { ListedCalendarEvent } from "./types";

const DUPLICATE_TOLERANCE_MS = 2 * 60_000;

export function eventsOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function eventEndMs(
  event: ListedCalendarEvent,
  fallbackDurationMinutes = 60
): number {
  if (event.endIso) {
    const end = new Date(event.endIso).getTime();
    if (!Number.isNaN(end)) return end;
  }
  const start = new Date(event.startIso).getTime();
  return start + fallbackDurationMinutes * 60_000;
}

export function findOverlappingEvents(
  events: ListedCalendarEvent[],
  startIso: string,
  endIso: string,
  options?: { ignoreCancelled?: boolean }
): ListedCalendarEvent[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];

  return events.filter((event) => {
    if (options?.ignoreCancelled !== false && event.cancelled) return false;
    const eventStart = new Date(event.startIso).getTime();
    const eventEnd = eventEndMs(event);
    if (Number.isNaN(eventStart)) return false;
    return eventsOverlap(startMs, endMs, eventStart, eventEnd);
  });
}

export function findDuplicateAgentBooking(
  events: ListedCalendarEvent[],
  startIso: string,
  attendeeName: string,
  options?: { appointmentTypeLabel?: string }
): ListedCalendarEvent | undefined {
  const targetStart = new Date(startIso).getTime();
  if (Number.isNaN(targetStart)) return undefined;

  const needle = attendeeName.trim().toLowerCase();
  const typeNeedle = options?.appointmentTypeLabel?.trim().toLowerCase();

  return events.find((event) => {
    if (!event.agentCreated || event.cancelled) return false;
    const eventStart = new Date(event.startIso).getTime();
    if (Number.isNaN(eventStart)) return false;
    if (Math.abs(eventStart - targetStart) > DUPLICATE_TOLERANCE_MS) return false;

    const haystack = `${event.title}\n${event.description ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
    if (typeNeedle && !event.title.toLowerCase().includes(typeNeedle)) return false;
    return true;
  });
}
