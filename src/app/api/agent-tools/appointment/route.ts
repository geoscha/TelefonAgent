import { NextResponse, type NextRequest } from "next/server";

import {
  cancelCalendarEvent,
  createCalendarEvent,
  DEFAULT_TZ,
  listCalendarEventsOnDay,
} from "@/lib/calendar";
import {
  buildAgentBookedDescription,
  formatAgentBookedTitle,
  isAgentCreatedCalendarEvent,
} from "@/lib/calendar/agent-labels";
import { getAgentCalendarIntegration } from "@/lib/integrations/agent-calendar";
import {
  getEnabledAppointmentTypes,
  normalizeAppointmentConfig,
  resolveAppointmentType,
} from "@/lib/integrations/appointment-config";
import {
  getCalendarForUser,
  getSettingsForUser,
  getUserIdByAgentId,
  upsertCalendarForUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const token = bearer || new URL(req.url).searchParams.get("token") || "";
  return token === secret;
}

interface ToolBody {
  action?:
    | "check_availability"
    | "book_appointment"
    | "find_appointments"
    | "cancel_appointment";
  agentId?: string;
  title?: string;
  startIso?: string;
  durationMinutes?: number;
  attendeeName?: string;
  attendeePhone?: string;
  notes?: string;
  /** YYYY-MM-DD for cancellation lookup */
  appointmentDate?: string;
  eventId?: string;
  eventUrl?: string;
}

function normalizeName(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function eventMatchesAttendee(
  title: string,
  description: string | undefined,
  attendeeName: string
): boolean {
  const needle = normalizeName(attendeeName);
  if (!needle) return false;
  const haystack = `${title}\n${description ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function isActiveAgentAppointment(event: {
  title: string;
  description?: string;
  cancelled?: boolean;
  agentCreated?: boolean;
}): boolean {
  return (
    Boolean(event.agentCreated) &&
    !event.cancelled &&
    isAgentCreatedCalendarEvent(event.title, event.description)
  );
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Nicht autorisiert." },
      { status: 401 }
    );
  }

  let body: ToolBody;
  try {
    body = (await req.json()) as ToolBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId fehlt." },
      { status: 400 }
    );
  }

  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Kein Konto für diese agentId gefunden." },
      { status: 404 }
    );
  }

  const settings = await getSettingsForUser(userId);
  const integration = getAgentCalendarIntegration(settings, agentId);
  const appointmentConfig = normalizeAppointmentConfig(
    integration.appointmentConfig
  );
  const provider = integration.calendarProvider;
  const enabled = integration.appointmentBookingEnabled;
  const connection = provider
    ? await getCalendarForUser(userId, provider)
    : undefined;
  const ready = enabled && provider && connection?.connected;
  const calendarCtx = connection
    ? {
        connection,
        save: async (patch: Parameters<typeof upsertCalendarForUser>[2]) => {
          await upsertCalendarForUser(userId, provider!, patch);
        },
      }
    : null;

  if (body.action === "check_availability") {
    const enabledTypes = getEnabledAppointmentTypes(appointmentConfig);
    const bookingReady =
      ready && appointmentConfig.allowBooking && enabledTypes.length > 0;
    const cancellationReady = ready && appointmentConfig.allowCancellation;

    let message = "Terminvereinbarung ist derzeit nicht möglich. Biete einen Rückruf an.";
    if (bookingReady && cancellationReady) {
      message =
        "Terminvereinbarung und Stornierung sind möglich. Frage zuerst nach dem Anliegen und dann nach den nötigen Angaben.";
    } else if (bookingReady) {
      message =
        "Terminvereinbarung ist möglich. Frage nach Terminart, Datum, Uhrzeit und Name.";
    } else if (cancellationReady) {
      message =
        "Terminstornierung ist möglich. Frage nach dem Termintag und dem Namen.";
    }

    return NextResponse.json({
      ok: true,
      available: Boolean(bookingReady || cancellationReady),
      bookingAvailable: bookingReady,
      cancellationAvailable: cancellationReady,
      appointmentTypes: enabledTypes.map((type) => type.label),
      message,
    });
  }

  if (body.action === "find_appointments") {
    if (!ready || !provider || !calendarCtx) {
      return NextResponse.json({
        ok: false,
        found: false,
        message: "Terminsuche ist nicht verfügbar.",
      });
    }
    if (!appointmentConfig.allowCancellation) {
      return NextResponse.json({
        ok: false,
        found: false,
        message: "Terminstornierung ist deaktiviert.",
      });
    }
    if (!body.appointmentDate || !body.attendeeName?.trim()) {
      return NextResponse.json({
        ok: false,
        found: false,
        message: "appointmentDate (YYYY-MM-DD) und attendeeName werden benötigt.",
      });
    }

    try {
      const events = await listCalendarEventsOnDay(
        provider,
        body.appointmentDate,
        calendarCtx
      );
      const matches = events.filter(
        (event) =>
          isActiveAgentAppointment(event) &&
          eventMatchesAttendee(
            event.title,
            event.description,
            body.attendeeName!.trim()
          )
      );

      if (matches.length === 0) {
        return NextResponse.json({
          ok: true,
          found: false,
          message: `Kein Termin für ${body.attendeeName.trim()} am ${body.appointmentDate} gefunden.`,
        });
      }

      return NextResponse.json({
        ok: true,
        found: true,
        appointments: matches.map((event) => ({
          eventId: event.id,
          eventUrl: event.eventUrl,
          title: event.title,
          startIso: event.startIso,
        })),
        message:
          matches.length === 1
            ? "Ein passender Termin gefunden."
            : `${matches.length} passende Termine gefunden. Frage nach der Uhrzeit.`,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          found: false,
          message:
            error instanceof Error
              ? error.message
              : "Terminsuche fehlgeschlagen.",
        },
        { status: 502 }
      );
    }
  }

  if (body.action === "cancel_appointment") {
    if (!ready || !provider || !calendarCtx) {
      return NextResponse.json({
        ok: false,
        cancelled: false,
        message: "Terminstornierung ist nicht verfügbar.",
      });
    }
    if (!appointmentConfig.allowCancellation) {
      return NextResponse.json({
        ok: false,
        cancelled: false,
        message: "Terminstornierung ist deaktiviert.",
      });
    }
    if (appointmentConfig.requireCallerName && !body.attendeeName?.trim()) {
      return NextResponse.json({
        ok: false,
        cancelled: false,
        message: "Der Name der anrufenden Person wird für die Stornierung benötigt.",
      });
    }
    if (
      appointmentConfig.requireAppointmentDateForCancel &&
      !body.appointmentDate?.trim()
    ) {
      return NextResponse.json({
        ok: false,
        cancelled: false,
        message: "Der Tag des Termins wird für die Stornierung benötigt.",
      });
    }

    try {
      let eventId = body.eventId?.trim();
      let eventUrl = body.eventUrl?.trim();

      if (!eventId && body.appointmentDate && body.attendeeName?.trim()) {
        const events = await listCalendarEventsOnDay(
          provider,
          body.appointmentDate,
          calendarCtx
        );
        const matches = events.filter(
          (event) =>
            isActiveAgentAppointment(event) &&
            eventMatchesAttendee(
              event.title,
              event.description,
              body.attendeeName!.trim()
            )
        );
        if (matches.length === 0) {
          return NextResponse.json({
            ok: false,
            cancelled: false,
            message: "Kein passender Termin zum Stornieren gefunden.",
          });
        }
        if (matches.length > 1) {
          return NextResponse.json({
            ok: false,
            cancelled: false,
            message:
              "Mehrere Termine gefunden. Bitte Uhrzeit erfragen und erneut suchen.",
            appointments: matches.map((event) => ({
              eventId: event.id,
              title: event.title,
              startIso: event.startIso,
            })),
          });
        }
        eventId = matches[0].id;
        eventUrl = matches[0].eventUrl;
      }

      if (!eventId) {
        return NextResponse.json({
          ok: false,
          cancelled: false,
          message: "eventId oder appointmentDate + attendeeName werden benötigt.",
        });
      }

      await cancelCalendarEvent(provider, eventId, calendarCtx, eventUrl);
      return NextResponse.json({
        ok: true,
        cancelled: true,
        message: `Termin von ${body.attendeeName?.trim() || "der anrufenden Person"} wurde im Kalender als abgesagt markiert.`,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: false,
          message:
            error instanceof Error
              ? error.message
              : "Termin konnte nicht storniert werden.",
        },
        { status: 502 }
      );
    }
  }

  if (body.action === "book_appointment") {
    if (!ready || !provider || !calendarCtx) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Terminvereinbarung ist nicht aktiviert oder kein Kalender verbunden.",
      });
    }
    if (!appointmentConfig.allowBooking) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Terminvereinbarung ist deaktiviert.",
      });
    }
    if (appointmentConfig.requireCallerName && !body.attendeeName?.trim()) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Der Name der anrufenden Person wird benötigt.",
      });
    }
    if (appointmentConfig.requireCallerPhone && !body.attendeePhone?.trim()) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Die Telefonnummer der anrufenden Person wird benötigt.",
      });
    }
    if (!body.title || !body.startIso) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Titel und Startzeitpunkt (startIso) werden benötigt.",
      });
    }

    const appointmentType = resolveAppointmentType(appointmentConfig, body.title);
    if (!appointmentType) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Keine erlaubte Terminart konfiguriert.",
      });
    }

    const start = new Date(body.startIso);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Ungültiger Startzeitpunkt.",
      });
    }

    const duration = Math.min(
      Math.max(body.durationMinutes ?? appointmentType.durationMinutes, 5),
      240
    );
    const end = new Date(start.getTime() + duration * 60_000);
    const attendeeName = body.attendeeName?.trim();
    const baseTitle = attendeeName
      ? `${appointmentType.label} — ${attendeeName}`
      : appointmentType.label;
    const title = formatAgentBookedTitle(baseTitle);

    const descriptionParts = [
      attendeeName ? `Kontakt: ${attendeeName}` : null,
      body.attendeePhone ? `Telefon: ${body.attendeePhone}` : null,
      body.notes ? `Notiz: ${body.notes}` : null,
      `Terminart: ${appointmentType.label}`,
    ].filter(Boolean);

    try {
      const event = await createCalendarEvent(
        provider,
        {
          title,
          description: buildAgentBookedDescription(
            descriptionParts as string[]
          ),
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          timeZone: DEFAULT_TZ,
        },
        calendarCtx
      );
      return NextResponse.json({
        ok: true,
        booked: true,
        eventId: event.id,
        appointmentType: appointmentType.label,
        message: `Termin «${appointmentType.label}» eingetragen für ${start.toLocaleString("de-CH", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: DEFAULT_TZ,
        })}.`,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          booked: false,
          message:
            error instanceof Error
              ? error.message
              : "Termin konnte nicht eingetragen werden.",
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Unbekannte Aktion." },
    { status: 400 }
  );
}
