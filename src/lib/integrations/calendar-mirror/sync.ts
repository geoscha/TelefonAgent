import "server-only";

import {
  listCalendarEventsInRange,
  listCalendarEventsOnDay,
} from "@/lib/calendar";
import type { CalendarContext, ListedCalendarEvent } from "@/lib/calendar/types";
import { resolveConnectedCalendarProvider } from "@/lib/integrations/agent-calendar";
import {
  getCalendarForUser,
  getSettingsForUser,
  upsertCalendarForUser,
  type CalendarProvider,
} from "@/lib/store";
import {
  getCalendarMirrorSyncedAt,
  readCalendarMirrorDay,
  readCalendarMirrorRange,
  replaceCalendarMirror,
} from "@/lib/integrations/calendar-mirror/store";

/** Mirror is considered fresh for this long; refreshed lazily on demand. */
const MIRROR_TTL_MS = 2 * 60_000;
/** How far back/forward to mirror. Past days catch same-day cancellations. */
const HORIZON_PAST_DAYS = 1;
const HORIZON_FUTURE_DAYS = 60;

export interface CalendarMirrorContext {
  provider: CalendarProvider;
  ctx: CalendarContext;
}

async function resolveMirrorContext(
  userId: string
): Promise<CalendarMirrorContext | null> {
  const settings = await getSettingsForUser(userId);
  const provider = await resolveConnectedCalendarProvider(
    userId,
    undefined,
    settings
  );
  if (!provider) return null;
  const connection = await getCalendarForUser(userId, provider);
  if (!connection?.connected) return null;

  return {
    provider,
    ctx: {
      connection,
      save: async (patch) => {
        await upsertCalendarForUser(userId, provider, patch);
      },
    },
  };
}

/**
 * Refresh the Supabase event mirror for a user from the connected calendar.
 * Pass `staleOnly` to skip when the mirror was refreshed within the TTL.
 * Returns the number of mirrored events, or -1 when skipped/unavailable.
 */
export async function syncCalendarMirrorForUser(
  userId: string,
  options?: { staleOnly?: boolean; context?: CalendarMirrorContext }
): Promise<number> {
  if (options?.staleOnly) {
    const last = await getCalendarMirrorSyncedAt(userId);
    if (last && Date.now() - Date.parse(last) < MIRROR_TTL_MS) return -1;
  }

  const context = options?.context ?? (await resolveMirrorContext(userId));
  if (!context) return -1;

  const now = Date.now();
  const rangeStart = new Date(
    now - HORIZON_PAST_DAYS * 86_400_000
  ).toISOString();
  const rangeEnd = new Date(
    now + HORIZON_FUTURE_DAYS * 86_400_000
  ).toISOString();

  const events = await listCalendarEventsInRange(
    context.provider,
    rangeStart,
    rangeEnd,
    context.ctx
  );

  return replaceCalendarMirror(userId, context.provider, events);
}

/**
 * Read a single day's events for the agent.
 *
 * Always serves from the Supabase mirror (refreshing it lazily if stale) so a
 * live phone call never blocks on the external calendar API. Falls back to a
 * live read only if the mirror is unavailable AND has never been populated.
 */
export async function getAgentDayEvents(params: {
  userId: string;
  provider: CalendarProvider;
  ctx: CalendarContext;
  dayIso: string;
  timeZone: string;
}): Promise<ListedCalendarEvent[]> {
  const { userId, provider, ctx, dayIso, timeZone } = params;

  let hasMirror = true;
  try {
    await syncCalendarMirrorForUser(userId, {
      staleOnly: true,
      context: { provider, ctx },
    });
  } catch (error) {
    console.error("[calendar-mirror] refresh failed", error);
    hasMirror = Boolean(await getCalendarMirrorSyncedAt(userId).catch(() => null));
  }

  if (hasMirror) {
    try {
      return await readCalendarMirrorDay(userId, dayIso, timeZone);
    } catch (error) {
      console.error("[calendar-mirror] read failed, falling back live", error);
    }
  }

  // Last-resort live read keeps booking correct if the mirror is broken/empty.
  return listCalendarEventsOnDay(provider, dayIso, ctx);
}

/**
 * Read a date range for the dashboard / customer matching. Refreshes the
 * mirror lazily, then serves from Supabase — never a live API call per request
 * unless the mirror has never been populated.
 */
export async function getMirroredRangeEvents(params: {
  userId: string;
  rangeStartIso: string;
  rangeEndIso: string;
}): Promise<ListedCalendarEvent[]> {
  const { userId, rangeStartIso, rangeEndIso } = params;

  let hasMirror = true;
  try {
    await syncCalendarMirrorForUser(userId, { staleOnly: true });
  } catch (error) {
    console.error("[calendar-mirror] range refresh failed", error);
    hasMirror = Boolean(
      await getCalendarMirrorSyncedAt(userId).catch(() => null)
    );
  }

  if (!hasMirror) return [];
  try {
    return await readCalendarMirrorRange(userId, rangeStartIso, rangeEndIso);
  } catch (error) {
    console.error("[calendar-mirror] range read failed", error);
    return [];
  }
}
