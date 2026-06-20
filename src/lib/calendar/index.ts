import "server-only";

import { googleCreateEvent, googleCancelEvent, googleDeleteEvent, googleListEventsInRange, googleListEventsOnDay, googleRescheduleEvent, googleAuthUrl } from "./google";
import { microsoftCreateEvent, microsoftCancelEvent, microsoftDeleteEvent, microsoftListEventsInRange, microsoftListEventsOnDay, microsoftRescheduleEvent, microsoftAuthUrl } from "./microsoft";
import { appleCreateEvent, appleCancelEvent, appleDeleteEvent, appleRescheduleEvent, appleListEventsOnDay, appleListEventsInRange } from "./apple";
import type {
  CalendarContext,
  CalendarEventInput,
  CreatedEvent,
  ListedCalendarEvent,
} from "./types";
import type { CalendarProvider } from "@/lib/store";

export { isConfigured } from "./config";
export { appleConnect } from "./apple";
export { googleExchangeCode, googleAuthUrl } from "./google";
export { microsoftExchangeCode, microsoftAuthUrl } from "./microsoft";
export * from "./types";
export {
  AGENT_CALENDAR_SOURCE_LABEL,
  AGENT_CREATED_DESCRIPTION,
  formatAgentBookedTitle,
  formatAgentCancelledTitle,
  buildAgentBookedDescription,
  buildAgentCancelledDescription,
  isAgentCreatedCalendarEvent,
  isCancelledCalendarEvent,
} from "./agent-labels";
export {
  CALENDAR_PROVIDERS,
  resolveConnectedCalendarProvider,
  findConnectedCalendarProviders,
} from "./resolve-connected";
export { ensureSingleCalendarConnection } from "./single-connection";

/** OAuth providers only (Apple uses a credential form, not a redirect). */
export function oauthAuthUrl(
  provider: "google" | "microsoft",
  state: string
): string {
  return provider === "google"
    ? googleAuthUrl(state)
    : microsoftAuthUrl(state);
}

export async function createCalendarEvent(
  provider: CalendarProvider,
  input: CalendarEventInput,
  ctx: CalendarContext
): Promise<CreatedEvent> {
  switch (provider) {
    case "google":
      return googleCreateEvent(input, ctx);
    case "microsoft":
      return microsoftCreateEvent(input, ctx);
    case "apple":
      return appleCreateEvent(input, ctx);
  }
}

export async function listCalendarEventsInRange(
  provider: CalendarProvider,
  rangeStartIso: string,
  rangeEndIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  switch (provider) {
    case "google":
      return googleListEventsInRange(rangeStartIso, rangeEndIso, ctx);
    case "microsoft":
      return microsoftListEventsInRange(rangeStartIso, rangeEndIso, ctx);
    case "apple":
      return appleListEventsInRange(rangeStartIso, rangeEndIso, ctx);
  }
}

export async function listCalendarEventsOnDay(
  provider: CalendarProvider,
  dayIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  switch (provider) {
    case "google":
      return googleListEventsOnDay(dayIso, ctx);
    case "microsoft":
      return microsoftListEventsOnDay(dayIso, ctx);
    case "apple":
      return appleListEventsOnDay(dayIso, ctx);
  }
}

export async function cancelCalendarEvent(
  provider: CalendarProvider,
  eventId: string,
  ctx: CalendarContext,
  eventUrl?: string
): Promise<void> {
  switch (provider) {
    case "google":
      return googleCancelEvent(eventId, ctx);
    case "microsoft":
      return microsoftCancelEvent(eventId, ctx);
    case "apple":
      return appleCancelEvent(eventId, ctx, eventUrl);
  }
}

export async function deleteCalendarEvent(
  provider: CalendarProvider,
  eventId: string,
  ctx: CalendarContext,
  eventUrl?: string
): Promise<void> {
  switch (provider) {
    case "google":
      return googleDeleteEvent(eventId, ctx);
    case "microsoft":
      return microsoftDeleteEvent(eventId, ctx);
    case "apple":
      return appleDeleteEvent(eventId, ctx, eventUrl);
  }
}

export async function rescheduleCalendarEvent(
  provider: CalendarProvider,
  input: {
    eventId: string;
    eventUrl?: string;
    startIso: string;
    endIso: string;
  },
  ctx: CalendarContext
): Promise<void> {
  switch (provider) {
    case "google":
      return googleRescheduleEvent(input, ctx);
    case "microsoft":
      return microsoftRescheduleEvent(input, ctx);
    case "apple":
      return appleRescheduleEvent(input, ctx);
  }
}

export interface PublicCalendarStatus {
  provider: CalendarProvider;
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
  agentPermissions?: import("@/lib/integrations/calendar-agent-permissions").CalendarAgentPermissions;
}
