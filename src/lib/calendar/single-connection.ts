import "server-only";

import { getCalendars, removeCalendar, type CalendarProvider } from "@/lib/store";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/provider-meta";

/** Keeps only one calendar provider connected per account. */
export async function ensureSingleCalendarConnection(
  keep: CalendarProvider
): Promise<CalendarProvider[]> {
  const calendars = await getCalendars();
  const disconnected: CalendarProvider[] = [];

  for (const provider of CALENDAR_PROVIDERS) {
    if (provider === keep) continue;
    const key = provider as CalendarProvider;
    if (calendars[key]?.connected) {
      await removeCalendar(key);
      disconnected.push(key);
    }
  }

  return disconnected;
}
