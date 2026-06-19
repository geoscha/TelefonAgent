import { NextResponse } from "next/server";

import { isConfigured, type PublicCalendarStatus } from "@/lib/calendar";
import { normalizeCalendarAgentPermissions } from "@/lib/integrations/calendar-agent-permissions";
import { getCalendars, getSettings, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

const PROVIDERS: CalendarProvider[] = ["google", "microsoft", "apple"];

export async function GET() {
  const [calendarsMap, settings] = await Promise.all([
    getCalendars(),
    getSettings(),
  ]);

  const calendars: PublicCalendarStatus[] = PROVIDERS.map((provider) => {
    const conn = calendarsMap[provider];
    return {
      provider,
      connected: Boolean(conn?.connected),
      configured: isConfigured(provider),
      accountLabel: conn?.accountLabel,
      connectedAt: conn?.connectedAt,
      agentPermissions: normalizeCalendarAgentPermissions(conn?.agentPermissions),
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
}
