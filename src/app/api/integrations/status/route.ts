import { NextResponse } from "next/server";

import { isConfigured, type PublicCalendarStatus } from "@/lib/calendar";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/provider-meta";
import { normalizeCalendarAgentPermissions } from "@/lib/integrations/calendar-agent-permissions";
import { isMailConfigured } from "@/lib/integrations/mail/config";
import {
  MAIL_PROVIDERS,
  type MailProviderId,
} from "@/lib/integrations/mail/provider-meta";
import { getMailConnections } from "@/lib/integrations/mail/store";
import {
  listWhatsAppConnections,
  toPublicWhatsAppStatus,
} from "@/lib/integrations/whatsapp/store";
import { getCalendars, getSettings, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [calendarsMap, settings, mailMap, whatsappConnections] =
      await Promise.all([
        getCalendars(),
        getSettings(),
        getMailConnections(),
        listWhatsAppConnections(),
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

    const mail = MAIL_PROVIDERS.map((provider) => {
      const conn = mailMap[provider as MailProviderId];
      return {
        provider,
        connected: Boolean(conn?.connected),
        configured: isMailConfigured(provider),
        accountLabel: conn?.accountLabel,
        connectedAt: conn?.connectedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      calendars,
      mail,
      whatsapp: whatsappConnections.map(toPublicWhatsAppStatus),
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
