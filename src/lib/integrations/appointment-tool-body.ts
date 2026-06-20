import { parseDurationMinutes } from "@/lib/integrations/resolve-appointment-start";

export interface AppointmentToolBody {
  action?:
    | "check_availability"
    | "book_appointment"
    | "find_appointments"
    | "cancel_appointment";
  agentId?: string;
  title?: string;
  appointmentTypeId?: string;
  startIso?: string;
  durationMinutes?: number;
  attendeeName?: string;
  attendeePhone?: string;
  notes?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  eventId?: string;
  eventUrl?: string;
}

export const TOOL_NAME_TO_ACTION: Record<string, AppointmentToolBody["action"]> = {
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

function readDurationMinutes(
  source: Record<string, unknown>
): number | undefined {
  const direct = readNumber(source, "durationMinutes", "duration_minutes");
  if (direct !== undefined) return direct;

  const raw = readString(
    source,
    "duration",
    "durationMinutes",
    "duration_minutes"
  );
  return parseDurationMinutes(raw);
}

const CALLER_PHONE_KEYS = [
  "attendeePhone",
  "attendee_phone",
  "system__caller_id",
  "caller_id",
  "callerId",
] as const;

function readCallerPhone(
  source: Record<string, unknown>,
  record: Record<string, unknown>
): string | undefined {
  for (const key of CALLER_PHONE_KEYS) {
    const value = readString(source, key);
    if (value) return value;
  }

  const dynamicVars =
    record.dynamic_variables && typeof record.dynamic_variables === "object"
      ? (record.dynamic_variables as Record<string, unknown>)
      : record.dynamicVariables && typeof record.dynamicVariables === "object"
        ? (record.dynamicVariables as Record<string, unknown>)
        : null;

  if (dynamicVars) {
    for (const key of ["system__caller_id", "caller_id", "callerId"]) {
      const value = readString(dynamicVars, key);
      if (value) return value;
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
    appointmentTypeId: readString(
      source,
      "appointmentTypeId",
      "appointment_type_id",
      "appointmentType",
      "appointment_type"
    ),
    startIso: readString(source, "startIso", "start_iso", "start"),
    durationMinutes: readDurationMinutes(source),
    attendeeName: readString(source, "attendeeName", "attendee_name"),
    attendeePhone: readCallerPhone(source, record),
    notes: readString(source, "notes"),
    appointmentDate: readString(
      source,
      "appointmentDate",
      "appointment_date",
      "date"
    ),
    appointmentTime: readString(
      source,
      "appointmentTime",
      "appointment_time",
      "time"
    ),
    eventId: readString(source, "eventId", "event_id"),
    eventUrl: readString(source, "eventUrl", "event_url"),
  };
}
