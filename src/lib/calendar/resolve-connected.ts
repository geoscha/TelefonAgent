import type { CalendarProvider } from "@/lib/store";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/provider-meta";

export { CALENDAR_PROVIDERS };

export function resolveConnectedCalendarProvider(
  calendars: Partial<Record<CalendarProvider, { connected?: boolean }>>
): CalendarProvider | null {
  for (const provider of CALENDAR_PROVIDERS) {
    const key = provider as CalendarProvider;
    if (calendars[key]?.connected) return key;
  }
  return null;
}

export function findConnectedCalendarProviders(
  calendars: Partial<Record<CalendarProvider, { connected?: boolean }>>
): CalendarProvider[] {
  return CALENDAR_PROVIDERS.filter((provider) =>
    Boolean(calendars[provider as CalendarProvider]?.connected)
  ) as CalendarProvider[];
}
