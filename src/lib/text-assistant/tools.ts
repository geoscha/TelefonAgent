import "server-only";

import type { StoredAgent } from "@/lib/onboarding-types";
import {
  getEnabledAppointmentTypes,
  normalizeAppointmentConfig,
} from "@/lib/integrations/appointment-config";

export function textAssistantTools(agent: StoredAgent) {
  if (!agent.appointmentBookingEnabled) return [];

  const config = normalizeAppointmentConfig(agent.appointmentConfig);
  const types = getEnabledAppointmentTypes(config)
    .map((t) => `${t.id}: ${t.label} (${t.durationMinutes} Min.)`)
    .join(", ");

  const tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> = [];

  if (config.allowBooking) {
    tools.push({
      type: "function",
      function: {
        name: "check_availability",
        description:
          "Prüft ob ein Termin-Slot frei ist. Immer aufrufen bevor du einen Termin zusagst.",
        parameters: {
          type: "object",
          properties: {
            appointmentDate: {
              type: "string",
              description: "Datum YYYY-MM-DD",
            },
            appointmentTime: {
              type: "string",
              description: "Uhrzeit HH:mm (24h)",
            },
            appointmentTypeId: {
              type: "string",
              description: `Terminart-ID. Verfügbar: ${types || "termin"}`,
            },
            durationMinutes: { type: "number" },
            attendeeName: { type: "string" },
          },
          required: ["appointmentDate", "appointmentTime"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "book_appointment",
        description:
          "Trägt einen bestätigten Termin in den Kalender ein. Nur nach check_availability und Kundenzustimmung.",
        parameters: {
          type: "object",
          properties: {
            attendeeName: { type: "string" },
            appointmentDate: { type: "string" },
            appointmentTime: { type: "string" },
            appointmentTypeId: { type: "string" },
            durationMinutes: { type: "number" },
            attendeePhone: { type: "string" },
            notes: { type: "string" },
          },
          required: ["attendeeName", "appointmentDate", "appointmentTime"],
        },
      },
    });
  }

  if (config.allowCancellation) {
    tools.push({
      type: "function",
      function: {
        name: "cancel_appointment",
        description: "Storniert einen bestehenden Termin.",
        parameters: {
          type: "object",
          properties: {
            attendeeName: { type: "string" },
            appointmentDate: { type: "string" },
            appointmentTime: { type: "string" },
            eventId: { type: "string" },
          },
          required: ["attendeeName"],
        },
      },
    });
  }

  return tools;
}
