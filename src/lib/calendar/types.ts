import type { CalendarConnection, CalendarProvider } from "@/lib/store";
import { PROVIDER_META } from "./provider-meta";

export type { CalendarProvider };
export { PROVIDER_META };

/**
 * Decouples calendar providers from the store: callers pass the current
 * connection plus a `save` callback that persists refreshed tokens. This lets
 * the same provider code run in both session (cookie) and admin (service-role)
 * contexts.
 */
export interface CalendarContext {
  connection: CalendarConnection;
  save: (patch: Partial<CalendarConnection>) => Promise<void>;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  /** ISO 8601 start, e.g. "2026-06-20T14:00:00+02:00". */
  startIso: string;
  /** ISO 8601 end. */
  endIso: string;
  /** IANA time zone; defaults to Europe/Zurich. */
  timeZone?: string;
  location?: string;
  /** Calendar category/label, e.g. «Linker». */
  categories?: string[];
}

export interface CreatedEvent {
  id: string;
  htmlLink?: string;
  /** iCloud collection URLs that received the event (connected + local default). */
  calendarUrls?: string[];
}

export interface ListedCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startIso: string;
  endIso?: string;
  eventUrl?: string;
  cancelled?: boolean;
  agentCreated?: boolean;
}

/** Provider metadata shown in the UI. */
export interface ProviderMeta {
  id: CalendarProvider;
  name: string;
  logoInitials: string;
  description: string;
}

export const DEFAULT_TZ = "Europe/Zurich";
