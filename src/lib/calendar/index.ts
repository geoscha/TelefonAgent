import "server-only";

import type { CalendarProvider } from "@/lib/store";
import { googleAuthUrl, googleCreateEvent } from "./google";
import { microsoftAuthUrl, microsoftCreateEvent } from "./microsoft";
import { appleCreateEvent } from "./apple";
import type {
  CalendarContext,
  CalendarEventInput,
  CreatedEvent,
} from "./types";

export { isConfigured } from "./config";
export { appleConnect } from "./apple";
export { googleExchangeCode } from "./google";
export { microsoftExchangeCode } from "./microsoft";
export * from "./types";

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

export interface PublicCalendarStatus {
  provider: CalendarProvider;
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}
