import "server-only";

import type { AppointmentConfig } from "@/lib/integrations/appointment-config";

type WebhookTool = {
  type: "webhook";
  name: string;
  description: string;
  responseTimeoutSecs?: number;
  apiSchema: {
    url: string;
    method: "POST";
    contentType: "application/json";
    requestHeaders?: Record<string, string>;
    requestBodySchema: {
      type: "object";
      required?: string[];
      properties: Record<
        string,
        {
          type: "string" | "integer" | "number" | "boolean";
          description?: string;
          constantValue?: string | number | boolean;
        }
      >;
    };
  };
};

function appointmentToolUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/api/agent-tools/appointment`;
}

function appointmentToolHeaders(): Record<string, string> | undefined {
  const secret = process.env.AGENT_TOOL_SECRET?.trim();
  if (!secret) return undefined;
  return { Authorization: `Bearer ${secret}` };
}

function constField(value: string) {
  return { type: "string" as const, constantValue: value };
}

function textField(description: string) {
  return { type: "string" as const, description };
}

function intField(description: string) {
  return { type: "integer" as const, description };
}

function baseBody(agentId: string, action: string) {
  return {
    action: constField(action),
    agentId: constField(agentId),
  };
}

function buildCheckAvailabilityTool(agentId: string): WebhookTool {
  return {
    type: "webhook",
    name: "check_availability",
    description:
      "Prüft, ob Terminvereinbarung und Stornierung für diesen Agenten verfügbar sind. Zu Beginn einer Terminanfrage aufrufen.",
    responseTimeoutSecs: 30,
    apiSchema: {
      url: appointmentToolUrl(),
      method: "POST",
      contentType: "application/json",
      requestHeaders: appointmentToolHeaders(),
      requestBodySchema: {
        type: "object",
        required: ["action", "agentId"],
        properties: baseBody(agentId, "check_availability"),
      },
    },
  };
}

function buildBookAppointmentTool(agentId: string): WebhookTool {
  return {
    type: "webhook",
    name: "book_appointment",
    description:
      "Trägt einen Termin im verbundenen Kalender ein. Nur aufrufen, wenn Name, Datum, Uhrzeit und Terminart klar sind.",
    responseTimeoutSecs: 60,
    apiSchema: {
      url: appointmentToolUrl(),
      method: "POST",
      contentType: "application/json",
      requestHeaders: appointmentToolHeaders(),
      requestBodySchema: {
        type: "object",
        required: ["action", "agentId", "title", "startIso", "attendeeName"],
        properties: {
          ...baseBody(agentId, "book_appointment"),
          title: textField(
            "Kurzer Titel mit Terminart, z. B. «Sprechstunde — Irmgard Huggentobler»"
          ),
          startIso: textField(
            "Startzeit als ISO 8601 mit Zeitzone Europe/Zurich, z. B. 2026-06-23T10:00:00+02:00"
          ),
          durationMinutes: intField(
            "Dauer in Minuten passend zur Terminart (z. B. 15 für Sprechstunde)"
          ),
          attendeeName: textField("Vollständiger Name der anrufenden Person"),
          attendeePhone: textField("Telefonnummer der anrufenden Person, falls bekannt"),
          notes: textField("Optionale Notiz zum Termin"),
        },
      },
    },
  };
}

function buildFindAppointmentsTool(agentId: string): WebhookTool {
  return {
    type: "webhook",
    name: "find_appointments",
    description:
      "Sucht bestehende Agent-Termine an einem Tag für eine Person (für Stornierung).",
    responseTimeoutSecs: 45,
    apiSchema: {
      url: appointmentToolUrl(),
      method: "POST",
      contentType: "application/json",
      requestHeaders: appointmentToolHeaders(),
      requestBodySchema: {
        type: "object",
        required: ["action", "agentId", "appointmentDate", "attendeeName"],
        properties: {
          ...baseBody(agentId, "find_appointments"),
          appointmentDate: textField("Termintag als YYYY-MM-DD"),
          attendeeName: textField("Name der anrufenden Person"),
        },
      },
    },
  };
}

function buildCancelAppointmentTool(agentId: string): WebhookTool {
  return {
    type: "webhook",
    name: "cancel_appointment",
    description:
      "Storniert einen zuvor mit find_appointments gefundenen Agent-Termin im Kalender.",
    responseTimeoutSecs: 45,
    apiSchema: {
      url: appointmentToolUrl(),
      method: "POST",
      contentType: "application/json",
      requestHeaders: appointmentToolHeaders(),
      requestBodySchema: {
        type: "object",
        required: ["action", "agentId", "eventId", "attendeeName"],
        properties: {
          ...baseBody(agentId, "cancel_appointment"),
          eventId: textField("eventId aus find_appointments"),
          eventUrl: textField("eventUrl aus find_appointments, falls vorhanden"),
          attendeeName: textField("Name der anrufenden Person"),
          appointmentDate: textField("Termintag als YYYY-MM-DD"),
        },
      },
    },
  };
}

/** Webhook tools for calendar booking — attached automatically to the ElevenLabs agent. */
export function buildAppointmentWebhookTools(
  agentId: string,
  appointmentConfig?: AppointmentConfig
): WebhookTool[] {
  const tools: WebhookTool[] = [
    buildCheckAvailabilityTool(agentId),
    buildBookAppointmentTool(agentId),
  ];

  if (appointmentConfig?.allowCancellation) {
    tools.push(
      buildFindAppointmentsTool(agentId),
      buildCancelAppointmentTool(agentId)
    );
  }

  return tools;
}
