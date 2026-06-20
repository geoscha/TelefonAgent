import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import type { AppointmentConfig } from "@/lib/integrations/appointment-config";
import { getSiteUrl } from "@/lib/auth/site-url";

const AGENT_ID_VARIABLE = "system__agent_id";

type WebhookToolConfig = {
  type: "webhook";
  name: string;
  description: string;
  responseTimeoutSecs: number;
  apiSchema: {
    url: string;
    method: "POST";
    contentType: "application/json";
    requestHeaders?: Record<string, string>;
    requestBodySchema: {
      type: "object";
      required?: string[];
      properties: Record<string, unknown>;
    };
  };
};

function appointmentToolUrl(): string {
  return `${getSiteUrl()}/api/agent-tools/appointment`;
}

function appointmentToolHeaders(): Record<string, string> | undefined {
  const secret = process.env.AGENT_TOOL_SECRET?.trim();
  if (!secret) return undefined;
  return { Authorization: `Bearer ${secret}` };
}

function buildApiSchema(requestBodySchema: WebhookToolConfig["apiSchema"]["requestBodySchema"]) {
  const headers = appointmentToolHeaders();
  return {
    url: appointmentToolUrl(),
    method: "POST" as const,
    contentType: "application/json" as const,
    ...(headers ? { requestHeaders: headers } : {}),
    requestBodySchema,
  };
}

function constField(value: string) {
  return { type: "string", constantValue: value };
}

function textField(description: string) {
  return { type: "string", description };
}

function intField(description: string) {
  return { type: "integer", description };
}

function agentIdField() {
  return { type: "string", dynamicVariable: AGENT_ID_VARIABLE };
}

function baseBody(action: string) {
  return {
    action: constField(action),
    agentId: agentIdField(),
  };
}

function buildCheckAvailabilityTool(): WebhookToolConfig {
  return {
    type: "webhook",
    name: "check_availability",
    description:
      "Prüft, ob Terminvereinbarung und Stornierung verfügbar sind. Zu Beginn einer Terminanfrage aufrufen.",
    responseTimeoutSecs: 30,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId"],
      properties: baseBody("check_availability"),
    }),
  };
}

function buildBookAppointmentTool(): WebhookToolConfig {
  return {
    type: "webhook",
    name: "book_appointment",
    description:
      "Trägt einen Termin im verbundenen Kalender ein. Nur aufrufen, wenn Name, Datum, Uhrzeit und Terminart klar sind.",
    responseTimeoutSecs: 60,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId", "title", "startIso", "attendeeName"],
      properties: {
        ...baseBody("book_appointment"),
        title: textField("Kurzer Titel mit Terminart"),
        startIso: textField(
          "Startzeit ISO 8601 mit Zeitzone Europe/Zurich, z. B. 2026-06-23T10:00:00+02:00"
        ),
        durationMinutes: intField("Dauer in Minuten passend zur Terminart"),
        attendeeName: textField("Vollständiger Name der anrufenden Person"),
        attendeePhone: textField("Telefonnummer, falls bekannt"),
        notes: textField("Optionale Notiz"),
      },
    }),
  };
}

function buildFindAppointmentsTool(): WebhookToolConfig {
  return {
    type: "webhook",
    name: "find_appointments",
    description:
      "Sucht bestehende Agent-Termine an einem Tag für eine Person (für Stornierung).",
    responseTimeoutSecs: 45,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId", "appointmentDate", "attendeeName"],
      properties: {
        ...baseBody("find_appointments"),
        appointmentDate: textField("Termintag als YYYY-MM-DD"),
        attendeeName: textField("Name der anrufenden Person"),
      },
    }),
  };
}

function buildCancelAppointmentTool(): WebhookToolConfig {
  return {
    type: "webhook",
    name: "cancel_appointment",
    description:
      "Storniert einen zuvor mit find_appointments gefundenen Agent-Termin im Kalender.",
    responseTimeoutSecs: 45,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId", "eventId", "attendeeName"],
      properties: {
        ...baseBody("cancel_appointment"),
        eventId: textField("eventId aus find_appointments"),
        eventUrl: textField("eventUrl aus find_appointments, falls vorhanden"),
        attendeeName: textField("Name der anrufenden Person"),
        appointmentDate: textField("Termintag als YYYY-MM-DD"),
      },
    }),
  };
}

function buildToolConfigs(
  appointmentConfig?: AppointmentConfig
): WebhookToolConfig[] {
  const tools = [buildCheckAvailabilityTool(), buildBookAppointmentTool()];
  if (appointmentConfig?.allowCancellation) {
    tools.push(buildFindAppointmentsTool(), buildCancelAppointmentTool());
  }
  return tools;
}

async function listWorkspaceWebhookTools(client: ElevenLabsClient) {
  const response = (await client.conversationalAi.tools.list({
    types: ["webhook"],
    pageSize: 100,
  })) as { tools?: { id: string; toolConfig?: { name?: string } }[] };

  return response.tools ?? [];
}

/** Registers shared Cura appointment webhook tools and returns their IDs. */
export async function ensureAppointmentToolIds(
  client: ElevenLabsClient,
  appointmentConfig?: AppointmentConfig
): Promise<string[]> {
  const desired = buildToolConfigs(appointmentConfig);
  const existing = await listWorkspaceWebhookTools(client);
  const byName = new Map(
    existing
      .filter((tool) => tool.toolConfig?.name)
      .map((tool) => [tool.toolConfig!.name as string, tool.id])
  );

  const ids: string[] = [];

  for (const config of desired) {
    const currentId = byName.get(config.name);
    if (currentId) {
      await client.conversationalAi.tools.update(currentId, {
        toolConfig: config,
      } as Parameters<typeof client.conversationalAi.tools.update>[1]);
      ids.push(currentId);
      continue;
    }

    const created = (await client.conversationalAi.tools.create({
      toolConfig: config,
    } as Parameters<typeof client.conversationalAi.tools.create>[0])) as {
      id: string;
    };
    ids.push(created.id);
  }

  return ids;
}
