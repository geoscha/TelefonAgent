import { NextResponse, type NextRequest } from "next/server";

import {
  cancelCalendarEvent,
  listCalendarEventsOnDay,
} from "@/lib/calendar";
import {
  isAgentCreatedCalendarEvent,
} from "@/lib/calendar/agent-labels";
import { getAgentCalendarIntegration, resolveConnectedCalendarProvider } from "@/lib/integrations/agent-calendar";
import { bookAppointmentForAgent } from "@/lib/integrations/book-appointment";
import { checkSlotForAgent } from "@/lib/integrations/check-slot";
import { parseAppointmentToolBody } from "@/lib/integrations/appointment-tool-body";
import { resolveAppointmentStartIso } from "@/lib/integrations/resolve-appointment-start";
import {
  getEnabledAppointmentTypes,
  normalizeAppointmentConfig,
} from "@/lib/integrations/appointment-config";
import { formatBusinessHoursForPrompt, normalizeBusinessHours } from "@/lib/integrations/business-hours";
import {
  getCalendarForUser,
  getSettingsForUser,
  getUserIdByAgentId,
  upsertCalendarForUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "appointment-tool",
    message: "Termin-Webhook erreichbar.",
  });
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const token = bearer || new URL(req.url).searchParams.get("token") || "";
  return token === secret;
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

function wantsSlotCheck(body: {
  startIso?: string;
  appointmentDate?: string;
  appointmentTime?: string;
}): boolean {
  return Boolean(
    body.startIso?.trim() ||
      body.appointmentDate?.trim() ||
      body.appointmentTime?.trim()
  );
}

function appointmentTypesPayload(
  appointmentConfig: ReturnType<typeof normalizeAppointmentConfig>
) {
  if (appointmentConfig.flexibleScheduling) {
    return [
      {
        id: "termin",
        label: "Freier Termin",
        flexible: true,
        durationHint: "5–240 Minuten — vom Agenten geschätzt",
      },
    ];
  }
  return getEnabledAppointmentTypes(appointmentConfig).map((type) => ({
    id: type.id,
    label: type.label,
    durationMinutes: type.durationMinutes,
  }));
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
    console.warn("[appointment-tool] unauthorized request");
    return NextResponse.json(
      { ok: false, error: "Nicht autorisiert." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const body = parseAppointmentToolBody(rawBody);
  const agentId = body.agentId?.trim();
  if (!agentId) {
    console.warn("[appointment-tool] missing agentId", rawBody);
    return NextResponse.json(
      { ok: false, error: "agentId fehlt." },
      { status: 400 }
    );
  }

  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    console.warn("[appointment-tool] no user for agent", agentId);
    return NextResponse.json(
      { ok: false, error: "Kein Konto für diese agentId gefunden." },
      { status: 404 }
    );
  }

  const settings = await getSettingsForUser(userId);
  const agent = settings.agents?.find((entry) => entry.id === agentId);
  const integration = getAgentCalendarIntegration(settings, agentId);
  const appointmentConfig = normalizeAppointmentConfig(
    integration.appointmentConfig
  );
  const provider = await resolveConnectedCalendarProvider(userId, agent, settings);
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
    const typesPayload = appointmentTypesPayload(appointmentConfig);
    const hoursSummary = normalizeBusinessHours(agent?.businessHours).summary;
    const hoursHint = formatBusinessHoursForPrompt(agent?.businessHours);

    if (!bookingReady) {
      let message =
        "Terminvereinbarung ist derzeit nicht möglich. Biete einen Rückruf an.";
      if (cancellationReady) {
        message =
          "Terminstornierung ist möglich. Terminvereinbarung ist nicht aktiv.";
      }
      return NextResponse.json({
        ok: true,
        slotChecked: false,
        available: false,
        bookingAvailable: false,
        cancellationAvailable: cancellationReady,
        appointmentTypes: typesPayload,
        businessHours: hoursSummary,
        businessHoursHint: hoursHint,
        message,
      });
    }

    if (wantsSlotCheck(body) && calendarCtx) {
      const resolved = resolveAppointmentStartIso({
        startIso: body.startIso,
        appointmentDate: body.appointmentDate,
        appointmentTime: body.appointmentTime,
      });

      if ("error" in resolved) {
        console.warn("[appointment-tool] slot parse failed", {
          agentId,
          startIso: body.startIso,
          appointmentDate: body.appointmentDate,
          appointmentTime: body.appointmentTime,
        });
        return NextResponse.json({
          ok: true,
          slotChecked: false,
          available: false,
          bookingAvailable: bookingReady,
          cancellationAvailable: cancellationReady,
          appointmentTypes: typesPayload,
          businessHours: hoursSummary,
          businessHoursHint: hoursHint,
          message: `${resolved.error} Beispiel: appointmentDate=2026-06-25, appointmentTime=11:00.`,
        });
      }

      const slotResult = await checkSlotForAgent({
        agentId,
        startIso: resolved.iso,
        appointmentTypeId: body.appointmentTypeId,
        durationMinutes: body.durationMinutes,
      });

      if (!slotResult.ok) {
        console.error("[appointment-tool] calendar slot check failed", {
          agentId,
          startIso: resolved.iso,
          message: slotResult.message,
        });
      }

      const calendarError = !slotResult.ok;
      const agentMessage = calendarError
        ? `${slotResult.message} check_availability mit denselben Parametern erneut aufrufen. Nicht an Mitarbeitende weiterleiten.`
        : slotResult.available
          ? `${slotResult.message} Sofort book_appointment aufrufen — dem Kunden vorher nicht sagen dass eingetragen wird.`
          : slotResult.message;

      return NextResponse.json({
        ok: true,
        slotChecked: slotResult.ok,
        available: slotResult.ok ? slotResult.available : false,
        calendarError,
        bookingAvailable: bookingReady,
        cancellationAvailable: cancellationReady,
        appointmentType: slotResult.appointmentType,
        durationMinutes: slotResult.durationMinutes,
        alternatives: slotResult.alternatives,
        resolvedStartIso: resolved.iso,
        appointmentTypes: typesPayload,
        businessHours: hoursSummary,
        businessHoursHint: hoursHint,
        message: agentMessage,
        ...(slotResult.ok && slotResult.available
          ? {
              nextAction:
                "Sofort book_appointment aufrufen. Dem Kunden NICHT vorher sagen dass eingetragen wird.",
            }
          : {}),
      });
    }

    return NextResponse.json({
      ok: true,
      slotChecked: false,
      available: true,
      bookingAvailable: bookingReady,
      cancellationAvailable: cancellationReady,
      appointmentTypes: typesPayload,
      businessHours: hoursSummary,
      businessHoursHint: hoursHint,
      message:
        "Terminvereinbarung ist aktiv. Frage nach Name, Datum und Uhrzeit, dann check_availability mit appointmentDate (YYYY-MM-DD) und appointmentTime (HH:mm) aufrufen.",
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
        nextAction:
          "Kurz bestätigen und danken, dann sofort end_call aufrufen.",
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
    const resolved = resolveAppointmentStartIso({
      startIso: body.startIso,
      appointmentDate: body.appointmentDate,
      appointmentTime: body.appointmentTime,
    });

    if ("error" in resolved) {
      return NextResponse.json({
        ok: true,
        booked: false,
        bookingError: true,
        message: `${resolved.error} appointmentDate (YYYY-MM-DD) und appointmentTime (HH:mm) senden.`,
      });
    }

    if (!body.attendeeName?.trim()) {
      return NextResponse.json({
        ok: true,
        booked: false,
        bookingError: true,
        message:
          "attendeeName fehlt. book_appointment mit attendeeName, appointmentDate, appointmentTime und appointmentTypeId aufrufen.",
      });
    }

    const result = await bookAppointmentForAgent({
      agentId,
      title: body.title,
      appointmentTypeId: body.appointmentTypeId,
      startIso: resolved.iso,
      attendeeName: body.attendeeName.trim(),
      attendeePhone: body.attendeePhone,
      notes: body.notes,
      durationMinutes: body.durationMinutes,
    });

    if (!result.booked) {
      console.warn("[appointment-tool] booking failed", {
        agentId,
        message: result.message,
        appointmentDate: body.appointmentDate,
        appointmentTime: body.appointmentTime,
        attendeeName: body.attendeeName,
      });
    }

    return NextResponse.json({
      ok: true,
      booked: result.booked,
      duplicate: result.duplicate,
      bookingError: !result.booked,
      eventId: result.eventId,
      appointmentType: result.appointmentType,
      resolvedStartIso: resolved.iso,
      message: result.booked
        ? result.message
        : `${result.message} Dem Kunden NICHT sagen dass eingetragen wurde — book_appointment erneut aufrufen.`,
      nextAction: result.booked
        ? "Ein kurzer Danke-Satz an den Kunden, dann SOFORT end_call aufrufen."
        : "book_appointment sofort erneut aufrufen. Dem Kunden nicht bestätigen.",
    });
  }

  console.warn("[appointment-tool] unknown action", body.action, rawBody);
  return NextResponse.json(
    { ok: false, error: "Unbekannte Aktion." },
    { status: 400 }
  );
}
