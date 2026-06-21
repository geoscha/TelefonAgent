import "server-only";

import { listCalendarEventsOnDay } from "@/lib/calendar";
import { findOverlappingEvents } from "@/lib/calendar/slot-validation";
import { getAgentCalendarIntegration, resolveConnectedCalendarProvider } from "@/lib/integrations/agent-calendar";
import { getAgentDayEvents } from "@/lib/integrations/calendar-mirror/sync";
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
} from "@/lib/store";

const SLOT_STEP_MINUTES = 15;
const MAX_ALTERNATIVES = 4;

export interface CheckSlotInput {
  agentId: string;
  startIso: string;
  appointmentTypeId?: string;
  durationMinutes?: number;
}

export interface CheckSlotResult {
  ok: boolean;
  available: boolean;
  message: string;
  alternatives?: string[];
  appointmentType?: string;
  durationMinutes?: number;
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

function formatSlot(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function minutesFromIso(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isoFromDayMinutes(dayIso: string, minutes: number): string {
  const month = Number(dayIso.slice(5, 7));
  const offset = month >= 3 && month <= 10 ? "+02:00" : "+01:00";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(
    `${dayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`
  ).toISOString();
}

function weekdayKeyFromDate(date: Date, timeZone: string) {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  })
    .format(date)
    .toLowerCase();
  return label as keyof Pick<
    BusinessHoursSchedule,
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"
  >;
}

function findAlternativeSlots(
  dayIso: string,
  durationMinutes: number,
  businessHours: BusinessHoursSchedule,
  dayEvents: Awaited<ReturnType<typeof listCalendarEventsOnDay>>,
  afterMinutes: number
): string[] {
  const alternatives: string[] = [];
  const dayKey = weekdayKeyFromDate(
    new Date(`${dayIso}T12:00:00`),
    businessHours.timeZone
  );
  const day = businessHours[dayKey];
  if (day.closed || day.ranges.length === 0) return alternatives;

  for (const range of day.ranges) {
    const [openH, openM] = range.start.split(":").map(Number);
    const [closeH, closeM] = range.end.split(":").map(Number);
    const rangeStart = openH * 60 + openM;
    const rangeEnd = closeH * 60 + closeM;

    for (
      let slotStart = Math.max(rangeStart, afterMinutes);
      slotStart + durationMinutes <= rangeEnd;
      slotStart += SLOT_STEP_MINUTES
    ) {
      const startIso = isoFromDayMinutes(dayIso, slotStart);
      const endIso = isoFromDayMinutes(dayIso, slotStart + durationMinutes);

      const start = new Date(startIso);
      const end = new Date(endIso);
      if (!isWithinBusinessHours(start, end, businessHours)) continue;

      const conflicts = findOverlappingEvents(dayEvents, startIso, endIso);
      if (conflicts.length === 0) {
        alternatives.push(formatSlot(startIso, businessHours.timeZone));
        if (alternatives.length >= MAX_ALTERNATIVES) return alternatives;
      }
    }
  }

  return alternatives;
}

export async function checkSlotForAgent(
  input: CheckSlotInput
): Promise<CheckSlotResult> {
  const agentId = input.agentId.trim();
  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    return {
      ok: false,
      available: false,
      message: "Kein Konto für diesen Agenten gefunden.",
    };
  }

  const settings = await getSettingsForUser(userId);
  const agent = settings.agents?.find((entry) => entry.id === agentId);
  const integration = getAgentCalendarIntegration(settings, agentId);
  const appointmentConfig = normalizeAppointmentConfig(
    integration.appointmentConfig
  );
  const businessHours = normalizeBusinessHours(agent?.businessHours);
  const provider = await resolveConnectedCalendarProvider(userId, agent, settings);
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
      available: false,
      message: "Terminvereinbarung ist nicht aktiviert oder kein Kalender verbunden.",
    };
  }

  if (!appointmentConfig.allowBooking) {
    return {
      ok: false,
      available: false,
      message: "Terminvereinbarung ist deaktiviert.",
    };
  }

  const appointmentType = resolveAppointmentType(
    appointmentConfig,
    undefined,
    input.appointmentTypeId
  );
  if (!appointmentType) {
    return {
      ok: false,
      available: false,
      message: "Keine erlaubte Terminart konfiguriert.",
    };
  }

  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) {
    return {
      ok: false,
      available: false,
      message: "Ungültiger Startzeitpunkt.",
    };
  }

  const duration = resolveAppointmentDurationMinutes(
    appointmentConfig,
    appointmentType,
    input.durationMinutes
  );
  const end = new Date(start.getTime() + duration * 60_000);

  if (
    !isFlexibleScheduling(appointmentConfig) &&
    !isWithinBusinessHours(start, end, businessHours)
  ) {
    return {
      ok: true,
      available: false,
      appointmentType: appointmentType.label,
      durationMinutes: duration,
      message: `Der Zeitraum liegt ausserhalb der Geschäftszeiten (${businessHours.summary.weekdays}).`,
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
    const conflicts = findOverlappingEvents(
      dayEvents,
      start.toISOString(),
      end.toISOString()
    );

    if (conflicts.length === 0) {
      return {
        ok: true,
        available: true,
        appointmentType: appointmentType.label,
        durationMinutes: duration,
        message: `Slot frei: ${formatSlot(start.toISOString(), businessHours.timeZone)} für ${appointmentType.label}.`,
      };
    }

    const conflictTime = formatSlot(conflicts[0].startIso, businessHours.timeZone);
    const afterMinutes =
      minutesFromIso(start.toISOString(), businessHours.timeZone) +
      SLOT_STEP_MINUTES;
    const alternatives = findAlternativeSlots(
      dayIso,
      duration,
      businessHours,
      dayEvents,
      afterMinutes
    );

    const altText =
      alternatives.length > 0
        ? ` Vorschläge: ${alternatives.join(", ")}.`
        : " Keine Alternativen am selben Tag gefunden — anderes Datum anbieten.";

    return {
      ok: true,
      available: false,
      appointmentType: appointmentType.label,
      durationMinutes: duration,
      alternatives,
      message: `Slot belegt (Überschneidung um ${conflictTime}).${altText}`,
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      message:
        error instanceof Error
          ? error.message
          : "Slot konnte nicht geprüft werden.",
    };
  }
}

/** Verifies calendar connectivity before a chat/call session starts. */
export async function probeAgentCalendar(
  agentId: string
): Promise<{ ok: boolean; message: string }> {
  const trimmed = agentId.trim();
  const userId = await getUserIdByAgentId(trimmed);
  if (!userId) {
    return { ok: false, message: "Kein Konto für diesen Agenten gefunden." };
  }

  const settings = await getSettingsForUser(userId);
  const agent = settings.agents?.find((entry) => entry.id === trimmed);
  const integration = getAgentCalendarIntegration(settings, trimmed);
  const provider = await resolveConnectedCalendarProvider(userId, agent, settings);
  const connection = provider
    ? await getCalendarForUser(userId, provider)
    : undefined;

  if (
    !integration.appointmentBookingEnabled ||
    !provider ||
    !connection?.connected
  ) {
    return {
      ok: false,
      message: "Terminvereinbarung ist nicht aktiv oder kein Kalender verbunden.",
    };
  }

  const businessHours = normalizeBusinessHours(
    settings.agents?.find((entry) => entry.id === trimmed)?.businessHours
  );
  const dayIso = dayIsoFromStart(new Date().toISOString(), businessHours.timeZone);
  const calendarCtx = {
    connection,
    save: async (patch: Parameters<typeof upsertCalendarForUser>[2]) => {
      await upsertCalendarForUser(userId, provider, patch);
    },
  };

  try {
    await listCalendarEventsOnDay(provider, dayIso, calendarCtx);
    return { ok: true, message: "Kalender erreichbar." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Kalender konnte nicht gelesen werden.",
    };
  }
}
