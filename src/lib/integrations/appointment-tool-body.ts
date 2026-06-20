export interface AppointmentToolBody {
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
  appointmentDate?: string;
  eventId?: string;
  eventUrl?: string;
}

const TOOL_NAME_TO_ACTION: Record<string, AppointmentToolBody["action"]> = {
  check_availability: "check_availability",
  book_appointment: "book_appointment",
  find_appointments: "find_appointments",
  cancel_appointment: "cancel_appointment",
};

function readString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readNumber(
  source: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** Normalizes ElevenLabs webhook payloads (flat, nested, snake_case). */
export function parseAppointmentToolBody(
  raw: unknown
): AppointmentToolBody {
  if (!raw || typeof raw !== "object") return {};

  const record = raw as Record<string, unknown>;
  const nested =
    record.parameters && typeof record.parameters === "object"
      ? (record.parameters as Record<string, unknown>)
      : null;

  const source = nested ? { ...record, ...nested } : record;

  const toolName = readString(source, "tool_name", "toolName");
  const action =
    readString(source, "action") ??
    (toolName ? TOOL_NAME_TO_ACTION[toolName] : undefined);

  return {
    action: action as AppointmentToolBody["action"],
    agentId: readString(source, "agentId", "agent_id"),
    title: readString(source, "title"),
    startIso: readString(source, "startIso", "start_iso", "start"),
    durationMinutes: readNumber(source, "durationMinutes", "duration_minutes"),
    attendeeName: readString(source, "attendeeName", "attendee_name"),
    attendeePhone: readString(source, "attendeePhone", "attendee_phone"),
    notes: readString(source, "notes"),
    appointmentDate: readString(
      source,
      "appointmentDate",
      "appointment_date"
    ),
    eventId: readString(source, "eventId", "event_id"),
    eventUrl: readString(source, "eventUrl", "event_url"),
  };
}
