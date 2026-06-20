import { NextResponse } from "next/server";

import { isConfigured, type PublicCalendarStatus } from "@/lib/calendar";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/provider-meta";
import { normalizeCalendarAgentPermissions } from "@/lib/integrations/calendar-agent-permissions";
import { getCalendars, getSettings, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [calendarsMap, settings] = await Promise.all([
      getCalendars(),
      getSettings(),
    ]);

    const calendars: PublicCalendarStatus[] = CALENDAR_PROVIDERS.map((provider) => {
      const conn = calendarsMap[provider as CalendarProvider];
      return {
        provider,
        connected: Boolean(conn?.connected),
        configured: isConfigured(provider),
        accountLabel: conn?.accountLabel,
        connectedAt: conn?.connectedAt,
        agentPermissions: normalizeCalendarAgentPermissions(
          conn?.agentPermissions
        ),
      };
    });

    return NextResponse.json({
      ok: true,
      calendars,
      appointment: {
        enabled: Boolean(settings.appointmentBookingEnabled),
        provider: settings.appointmentProvider ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[integrations/status]", error);
    return NextResponse.json(
      { ok: false, error: "Status konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
