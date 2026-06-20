import "server-only";

import type { StoredAgent } from "@/lib/onboarding-types";
import {
  getEnabledAppointmentTypes,
  isFlexibleScheduling,
  normalizeAppointmentConfig,
} from "@/lib/integrations/appointment-config";

export function textAssistantTools(agent: StoredAgent) {
  if (!agent.appointmentBookingEnabled) return [];

  const config = normalizeAppointmentConfig(agent.appointmentConfig);
  const flexible = isFlexibleScheduling(config);
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

  const durationDescription = flexible
    ? "Geschätzte Dauer in Minuten (5–240) — aus dem Anliegen ableiten, z. B. Arzt 30, Meeting 60, Mittagessen 90"
    : "Dauer in Minuten — aus Terminart oder Kundenangabe";

  if (config.allowBooking) {
    tools.push({
      type: "function",
      function: {
        name: "check_availability",
        description: flexible
          ? "Prüft ob ein Termin-Slot frei ist. Immer durationMinutes mitgeben (geschätzte Dauer). Vor book_appointment aufrufen."
          : "Prüft ob ein Termin-Slot frei ist. Immer aufrufen bevor du einen Termin zusagst.",
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
            appointmentTypeId: flexible
              ? { type: "string", description: "Optional" }
              : {
                  type: "string",
                  description: `Terminart-ID. Verfügbar: ${types || "termin"}`,
                },
            durationMinutes: {
              type: "number",
              description: durationDescription,
            },
            attendeeName: { type: "string" },
            title: {
              type: "string",
              description: flexible
                ? "Kurzbeschreibung des Termins, z. B. «Zahnarzt», «Mittagessen»"
                : "Optional",
            },
          },
          required: flexible
            ? ["appointmentDate", "appointmentTime", "durationMinutes"]
            : ["appointmentDate", "appointmentTime"],
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: "book_appointment",
        description: flexible
          ? "Trägt einen bestätigten Termin in den Kalender ein. durationMinutes aus dem Anliegen schätzen. Nur nach check_availability und Zustimmung."
          : "Trägt einen bestätigten Termin in den Kalender ein. Nur nach check_availability und Kundenzustimmung.",
        parameters: {
          type: "object",
          properties: {
            attendeeName: { type: "string" },
            appointmentDate: { type: "string" },
            appointmentTime: { type: "string" },
            appointmentTypeId: { type: "string", description: "Optional" },
            durationMinutes: {
              type: "number",
              description: durationDescription,
            },
            title: {
              type: "string",
              description: flexible
                ? "Kurzbeschreibung für den Kalendereintrag, z. B. «Arzt», «Besprechung»"
                : "Optional",
            },
            attendeePhone: { type: "string" },
            notes: {
              type: "string",
              description:
                "Sonderwünsche oder Bemerkungen des Kunden (z. B. bestimmte Coiffeurin, Behandlungsdetail, Allergie). Im Kalender als Notiz gespeichert.",
            },
          },
          required: flexible
            ? [
                "attendeeName",
                "appointmentDate",
                "appointmentTime",
                "durationMinutes",
              ]
            : ["attendeeName", "appointmentDate", "appointmentTime"],
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
