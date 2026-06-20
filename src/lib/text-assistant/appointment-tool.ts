import "server-only";

import { APP_URL } from "@/lib/integrations/mail/config";
import {
  TOOL_NAME_TO_ACTION,
  type AppointmentToolBody,
} from "@/lib/integrations/appointment-tool-body";

export async function runTextAssistantAppointmentTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const action = TOOL_NAME_TO_ACTION[toolName];
  if (!action) {
    return { ok: false, message: `Unbekanntes Tool: ${toolName}` };
  }

  const body: AppointmentToolBody = {
    action,
    agentId,
    title: typeof args.title === "string" ? args.title : undefined,
    appointmentTypeId:
      typeof args.appointmentTypeId === "string"
        ? args.appointmentTypeId
        : undefined,
    startIso: typeof args.startIso === "string" ? args.startIso : undefined,
    durationMinutes:
      typeof args.durationMinutes === "number"
        ? args.durationMinutes
        : undefined,
    attendeeName:
      typeof args.attendeeName === "string" ? args.attendeeName : undefined,
    attendeePhone:
      typeof args.attendeePhone === "string" ? args.attendeePhone : undefined,
    notes: typeof args.notes === "string" ? args.notes : undefined,
    appointmentDate:
      typeof args.appointmentDate === "string" ? args.appointmentDate : undefined,
    appointmentTime:
      typeof args.appointmentTime === "string" ? args.appointmentTime : undefined,
    eventId: typeof args.eventId === "string" ? args.eventId : undefined,
    eventUrl: typeof args.eventUrl === "string" ? args.eventUrl : undefined,
  };

  const secret = process.env.AGENT_TOOL_SECRET?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const res = await fetch(`${APP_URL}/api/agent-tools/appointment`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: `Termin-Tool fehlgeschlagen (HTTP ${res.status}).`,
    };
  }
}
