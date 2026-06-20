import "server-only";

import {
  createCalendarEvent,
  DEFAULT_TZ,
} from "@/lib/calendar";
import {
  buildAgentBookedDescription,
  formatAgentBookedTitle,
} from "@/lib/calendar/agent-labels";
import { getAgentCalendarIntegration } from "@/lib/integrations/agent-calendar";
import {
  normalizeAppointmentConfig,
  resolveAppointmentType,
} from "@/lib/integrations/appointment-config";
import {
  getCalendarForUser,
  getSettingsForUser,
  getUserIdByAgentId,
  upsertCalendarForUser,
} from "@/lib/store";

export interface BookAppointmentInput {
  agentId: string;
  title: string;
  startIso: string;
  attendeeName: string;
  attendeePhone?: string;
  notes?: string;
  durationMinutes?: number;
}

export interface BookAppointmentResult {
  ok: boolean;
  booked: boolean;
  message: string;
  eventId?: string;
  appointmentType?: string;
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
  const integration = getAgentCalendarIntegration(settings, agentId);
  const appointmentConfig = normalizeAppointmentConfig(
    integration.appointmentConfig
  );
  const provider = integration.calendarProvider;
  const connection = provider
    ? await getCalendarForUser(userId, provider)
    : undefined;
  const ready =
    integration.appointmentBookingEnabled &&
    provider &&
    connection?.connected;

  if (!ready || !provider || !connection) {
    return {
      ok: false,
      booked: false,
      message:
        "Terminvereinbarung ist nicht aktiviert oder kein Kalender verbunden.",
    };
  }

  if (!appointmentConfig.allowBooking) {
    return {
      ok: false,
      booked: false,
      message: "Terminvereinbarung ist deaktiviert.",
    };
  }

  if (appointmentConfig.requireCallerName && !input.attendeeName.trim()) {
    return {
      ok: false,
      booked: false,
      message: "Der Name der anrufenden Person wird benötigt.",
    };
  }

  if (appointmentConfig.requireCallerPhone && !input.attendeePhone?.trim()) {
    return {
      ok: false,
      booked: false,
      message: "Die Telefonnummer der anrufenden Person wird benötigt.",
    };
  }

  const appointmentType = resolveAppointmentType(
    appointmentConfig,
    input.title
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

  const duration = Math.min(
    Math.max(input.durationMinutes ?? appointmentType.durationMinutes, 5),
    240
  );
  const end = new Date(start.getTime() + duration * 60_000);
  const attendeeName = input.attendeeName.trim();
  const baseTitle = `${appointmentType.label} — ${attendeeName}`;
  const title = formatAgentBookedTitle(baseTitle);

  const descriptionParts = [
    `Kontakt: ${attendeeName}`,
    input.attendeePhone ? `Telefon: ${input.attendeePhone}` : null,
    input.notes ? `Notiz: ${input.notes}` : null,
    `Terminart: ${appointmentType.label}`,
  ].filter(Boolean) as string[];

  const calendarCtx = {
    connection,
    save: async (patch: Parameters<typeof upsertCalendarForUser>[2]) => {
      await upsertCalendarForUser(userId, provider, patch);
    },
  };

  try {
    const event = await createCalendarEvent(
      provider,
      {
        title,
        description: buildAgentBookedDescription(descriptionParts),
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timeZone: DEFAULT_TZ,
      },
      calendarCtx
    );

    return {
      ok: true,
      booked: true,
      eventId: event.id,
      appointmentType: appointmentType.label,
      message: `Termin «${appointmentType.label}» eingetragen für ${start.toLocaleString("de-CH", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: DEFAULT_TZ,
      })}.`,
    };
  } catch (error) {
    return {
      ok: false,
      booked: false,
      message:
        error instanceof Error
          ? error.message
          : "Termin konnte nicht eingetragen werden.",
    };
  }
}
