import "server-only";

import type { CalendarProvider } from "@/lib/store";
import { googleAuthUrl, googleCreateEvent } from "./google";
import { microsoftAuthUrl, microsoftCreateEvent } from "./microsoft";
import { appleCreateEvent, appleCancelEvent, appleListEventsOnDay } from "./apple";
import type {
  CalendarContext,
  CalendarEventInput,
  CreatedEvent,
  ListedCalendarEvent,
} from "./types";

export { isConfigured } from "./config";
export { appleConnect } from "./apple";
export { googleExchangeCode } from "./google";
export { microsoftExchangeCode } from "./microsoft";
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

export async function listCalendarEventsOnDay(
  provider: CalendarProvider,
  dayIso: string,
  ctx: CalendarContext
): Promise<ListedCalendarEvent[]> {
  switch (provider) {
    case "apple":
      return appleListEventsOnDay(dayIso, ctx);
    default:
      throw new Error("Termin-Suche ist für diesen Kalenderanbieter noch nicht verfügbar.");
  }
}

export async function cancelCalendarEvent(
  provider: CalendarProvider,
  eventId: string,
  ctx: CalendarContext,
  eventUrl?: string
): Promise<void> {
  switch (provider) {
    case "apple":
      return appleCancelEvent(eventId, ctx, eventUrl);
    default:
      throw new Error("Termin-Stornierung ist für diesen Kalenderanbieter noch nicht verfügbar.");
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
