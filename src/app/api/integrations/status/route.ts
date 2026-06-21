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
  PROPERTY_SOFTWARE_PROVIDERS,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import {
  getPropertySoftwareConnections,
  toPublicPropertySoftwareStatus,
} from "@/lib/integrations/property-software/store";
import {
  listWhatsAppConnections,
  toPublicWhatsAppStatus,
} from "@/lib/integrations/whatsapp/store";
import {
  SMS_PROVIDERS,
  type SmsProviderId,
} from "@/lib/integrations/sms/provider-meta";
import {
  getSmsConnections,
  toPublicSmsStatus,
} from "@/lib/integrations/sms/store";
import { isCustomerSourceConfigured } from "@/lib/customers/source";
import { isCustomerDataProvider } from "@/lib/customers/types";
import { getCalendars, getSettings, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      calendarsMap,
      settings,
      mailMap,
      whatsappConnections,
      propertySoftwareMap,
      smsMap,
    ] = await Promise.all([
      getCalendars(),
      getSettings(),
      getMailConnections(),
      listWhatsAppConnections(),
      getPropertySoftwareConnections(),
      getSmsConnections(),
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

    const propertySoftware = PROPERTY_SOFTWARE_PROVIDERS.map((provider) => {
      const conn = propertySoftwareMap[provider as PropertySoftwareProviderId];
      return conn
        ? toPublicPropertySoftwareStatus(conn)
        : { provider, connected: false };
    });

    const sms = SMS_PROVIDERS.map((provider) => {
      const conn = smsMap[provider as SmsProviderId];
      return conn
        ? toPublicSmsStatus(conn)
        : { provider, connected: false };
    });

    const customerProvider =
      settings.customerDataProvider &&
      isCustomerDataProvider(settings.customerDataProvider)
        ? settings.customerDataProvider
        : null;
    const customerSource = {
      provider: customerProvider,
      ready: customerProvider
        ? isCustomerSourceConfigured(
            customerProvider,
            propertySoftwareMap[customerProvider]
          )
        : false,
    };

    return NextResponse.json({
      ok: true,
      calendars,
      mail,
      whatsapp: whatsappConnections.map(toPublicWhatsAppStatus),
      propertySoftware,
      sms,
      customerSource,
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
