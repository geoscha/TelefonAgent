import type { CalendarConnection, CalendarProvider } from "@/lib/store";

export type { CalendarProvider };

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
}

export interface CreatedEvent {
  id: string;
  htmlLink?: string;
}

export interface ListedCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startIso: string;
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

export const PROVIDER_META: Record<CalendarProvider, ProviderMeta> = {
  google: {
    id: "google",
    name: "Google Kalender",
    logoInitials: "G",
    description:
      "Termine und Besichtigungen direkt in Google Calendar eintragen.",
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft Outlook",
    logoInitials: "O",
    description:
      "Termine in Outlook / Microsoft 365 über Microsoft Graph anlegen.",
  },
  apple: {
    id: "apple",
    name: "Apple Kalender (iCloud)",
    logoInitials: "A",
    description:
      "iCloud-Kalender via CalDAV mit App-spezifischem Passwort verbinden.",
  },
};

export const DEFAULT_TZ = "Europe/Zurich";
