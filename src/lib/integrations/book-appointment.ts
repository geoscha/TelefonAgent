import "server-only";

import {
  createCalendarEvent,
  DEFAULT_TZ,
  listCalendarEventsOnDay,
} from "@/lib/calendar";
import {
  buildAgentBookedDescription,
  LINKER_CALENDAR_LABEL,
  formatAppointmentTitle,
} from "@/lib/calendar/agent-labels";
import {
  findDuplicateAgentBooking,
  findOverlappingEvents,
} from "@/lib/calendar/slot-validation";
import { getAgentCalendarIntegration, resolveConnectedCalendarProvider } from "@/lib/integrations/agent-calendar";
import { getAgentDayEvents } from "@/lib/integrations/calendar-mirror/sync";
import { upsertCalendarMirrorEvent } from "@/lib/integrations/calendar-mirror/store";
import {
  normalizeAppointmentConfig,
  resolveAppointmentDurationMinutes,
  resolveAppointmentType,
  isFlexibleScheduling,
} from "@/lib/integrations/appointment-config";
import {
  isWithinBusinessHours,
  normalizeBusinessHours,
  type BusinessHoursSchedule,
} from "@/lib/integrations/business-hours";
import {
  getCalendarForUser,
  getSettingsForUser,
  getUserIdByAgentId,
  upsertCalendarForUser,
  type CalendarProvider,
} from "@/lib/store";
import type { StoredAgent } from "@/lib/onboarding-types";

export interface BookAppointmentInput {
  agentId: string;
  title?: string;
  appointmentTypeId?: string;
  startIso: string;
  attendeeName: string;
  attendeePhone?: string;
  notes?: string;
  durationMinutes?: number;
  /** Post-call writes skip live visibility polling (CalDAV sync delay). */
  bookingSource?: "live" | "post-call";
}

export interface BookAppointmentResult {
  ok: boolean;
  booked: boolean;
  duplicate?: boolean;
  bookingError?: boolean;
  message: string;
  eventId?: string;
  appointmentType?: string;
}

function dayIsoFromStart(startIso: string, timeZone: string): string {
  const date = new Date(startIso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function resolveAgentBusinessHours(
  agent: StoredAgent | undefined
): BusinessHoursSchedule {
  return normalizeBusinessHours(agent?.businessHours);
}

async function verifyBookedEventVisible(
  provider: CalendarProvider,
  dayIso: string,
  ctx: {
    connection: NonNullable<Awaited<ReturnType<typeof getCalendarForUser>>>;
    save: (patch: Parameters<typeof upsertCalendarForUser>[2]) => Promise<void>;
  },
  event: { id: string; title: string; startIso: string }
): Promise<boolean> {
  // Google/Microsoft return synchronously from the REST API — no CalDAV delay.
  if (provider !== "apple") {
    return true;
  }

  const targetStart = new Date(event.startIso).getTime();
  const events = await listCalendarEventsOnDay(provider, dayIso, ctx);
  return events.some((entry) => {
    if (entry.id === event.id) return true;
    if (entry.title !== event.title) return false;
    const entryStart = new Date(entry.startIso).getTime();
    return (
      !Number.isNaN(entryStart) &&
      !Number.isNaN(targetStart) &&
      Math.abs(entryStart - targetStart) <= 2 * 60_000
    );
  });
}

export async function bookAppointmentForAgent(
  input: BookAppointmentInput
): Promise<BookAppointmentResult> {
  const agentId = input.agentId.trim();
  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    return {
      ok: false,
      booked: false,
      message: "Kein Konto für diesen Agenten gefunden.",
    };
  }

  const settings = await getSettingsForUser(userId);
  const agent = settings.agents?.find((entry) => entry.id === agentId);
  const integration = getAgentCalendarIntegration(settings, agentId);
  const appointmentConfig = normalizeAppointmentConfig(
    integration.appointmentConfig
  );
  const businessHours = resolveAgentBusinessHours(agent);
  const isPostCall = input.bookingSource === "post-call";
  const provider = await resolveConnectedCalendarProvider(userId, agent, settings);
  const connection = provider
    ? await getCalendarForUser(userId, provider)
    : undefined;
  const ready = isPostCall
    ? Boolean(provider && connection?.connected)
    : integration.appointmentBookingEnabled &&
      Boolean(provider && connection?.connected);

  if (!ready || !provider || !connection) {
    console.warn("[book-appointment] calendar not ready", {
      agentId,
      isPostCall,
      provider,
      connected: connection?.connected ?? false,
      appointmentBookingEnabled: integration.appointmentBookingEnabled,
    });
    return {
      ok: false,
      booked: false,
      message: isPostCall
        ? "Kein Kalender verbunden."
        : "Terminvereinbarung ist nicht aktiviert oder kein Kalender verbunden.",
    };
  }

  if (!isPostCall && !appointmentConfig.allowBooking) {
    return {
      ok: false,
      booked: false,
      message: "Terminvereinbarung ist deaktiviert.",
    };
  }

  if (appointmentConfig.requireCallerName && !input.attendeeName.trim() && !isPostCall) {
    return {
      ok: true,
      booked: false,
      message:
        "Der Nachname wird benötigt. book_appointment mit attendeeName (Nachname) aufrufen.",
    };
  }

  const appointmentType = resolveAppointmentType(
    appointmentConfig,
    input.title,
    input.appointmentTypeId
  );
  if (!appointmentType) {
    return {
      ok: false,
      booked: false,
      message: "Keine erlaubte Terminart konfiguriert.",
    };
  }

  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) {
    return {
      ok: false,
      booked: false,
      message: "Ungültiger Startzeitpunkt.",
    };
  }

  const duration = resolveAppointmentDurationMinutes(
    appointmentConfig,
    appointmentType,
    input.durationMinutes
  );
  const end = new Date(start.getTime() + duration * 60_000);
  const attendeeName = input.attendeeName.trim();
  const eventLabel =
    isFlexibleScheduling(appointmentConfig) && input.title?.trim()
      ? input.title.trim()
      : appointmentType.label;
  const title = formatAppointmentTitle(eventLabel, attendeeName);

  if (
    !isPostCall &&
    !isFlexibleScheduling(appointmentConfig) &&
    !isWithinBusinessHours(start, end, businessHours)
  ) {
    return {
      ok: false,
      booked: false,
      message: `Der gewählte Zeitraum liegt ausserhalb der Geschäftszeiten (${businessHours.summary.weekdays}).`,
    };
  }

  const calendarCtx = {
    connection,
    save: async (patch: Parameters<typeof upsertCalendarForUser>[2]) => {
      await upsertCalendarForUser(userId, provider, patch);
    },
  };

  const dayIso = dayIsoFromStart(start.toISOString(), businessHours.timeZone);

  try {
    const dayEvents = await getAgentDayEvents({
      userId,
      provider,
      ctx: calendarCtx,
      dayIso,
      timeZone: businessHours.timeZone,
    });

    const duplicate = findDuplicateAgentBooking(
      dayEvents,
      start.toISOString(),
      attendeeName,
      { appointmentTypeLabel: appointmentType.label }
    );
    if (duplicate) {
      return {
        ok: true,
        booked: true,
        duplicate: true,
        eventId: duplicate.id,
        appointmentType: appointmentType.label,
        message: `Termin «${appointmentType.label}» existiert bereits für ${start.toLocaleString("de-CH", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: businessHours.timeZone,
        })}.`,
      };
    }

    const conflicts = findOverlappingEvents(
      dayEvents,
      start.toISOString(),
      end.toISOString()
    );
    if (!isPostCall && conflicts.length > 0) {
      const conflictTime = new Date(conflicts[0].startIso).toLocaleString(
        "de-CH",
        { timeStyle: "short", timeZone: businessHours.timeZone }
      );
      return {
        ok: true,
        booked: false,
        message: `Zeitraum nicht verfügbar — Überschneidung mit bestehendem Termin um ${conflictTime}.`,
      };
    }

    const descriptionParts = [
      `Kontakt: ${attendeeName}`,
      input.attendeePhone ? `Telefon: ${input.attendeePhone}` : null,
      `Zweck: ${appointmentType.label}`,
      input.notes ? `Notiz: ${input.notes}` : null,
    ].filter(Boolean) as string[];

    const event = await createCalendarEvent(
      provider,
      {
        title,
        description: buildAgentBookedDescription(descriptionParts),
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timeZone: DEFAULT_TZ,
        categories: [LINKER_CALENDAR_LABEL],
      },
      calendarCtx
    );

    const verified =
      input.bookingSource === "post-call"
        ? true
        : await verifyBookedEventVisible(
            provider,
            dayIso,
            calendarCtx,
            {
              id: event.id,
              title,
              startIso: start.toISOString(),
            }
          );

    if (!verified) {
      console.warn("[book-appointment] event not visible after write", {
        agentId,
        eventId: event.id,
        calendarUrls: event.calendarUrls,
        dayIso,
      });
      return {
        ok: true,
        booked: false,
        bookingError: true,
        message:
          "Termin wurde geschrieben, ist im Kalender aber noch nicht sichtbar — book_appointment erneut aufrufen.",
      };
    }

    // Keep the mirror consistent for the rest of the call without a re-pull.
    try {
      await upsertCalendarMirrorEvent(userId, provider, {
        id: event.id,
        title,
        description: buildAgentBookedDescription(descriptionParts),
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        eventUrl: event.htmlLink,
        cancelled: false,
        agentCreated: true,
      });
    } catch (mirrorError) {
      console.error("[book-appointment] mirror update failed", mirrorError);
    }

    const calendarNote =
      event.calendarUrls && event.calendarUrls.length > 1
        ? " (verbundener und lokaler Kalender)"
        : "";

    return {
      ok: true,
      booked: true,
      eventId: event.id,
      appointmentType: appointmentType.label,
      message: `Termin «${appointmentType.label}» eingetragen${calendarNote} für ${start.toLocaleString("de-CH", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: businessHours.timeZone,
      })}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Termin konnte nicht eingetragen werden.";
    console.error("[book-appointment] calendar write failed", {
      agentId,
      message,
    });
    return {
      ok: true,
      booked: false,
      bookingError: true,
      message: `${message} Bitte book_appointment erneut aufrufen.`,
    };
  }
}
