import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import type { AppointmentConfig } from "@/lib/integrations/appointment-config";
import { getSiteUrl } from "@/lib/auth/site-url";

const AGENT_ID_VARIABLE = "system__agent_id";
const CALLER_ID_VARIABLE = "system__caller_id";

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

function appointmentToolUrl(siteUrl?: string): string {
  const base = siteUrl?.replace(/\/$/, "") || getSiteUrl();
  return `${base}/api/agent-tools/appointment`;
}

function appointmentToolHeaders(): Record<string, string> | undefined {
  const secret = process.env.AGENT_TOOL_SECRET?.trim();
  if (!secret) return undefined;
  return { Authorization: `Bearer ${secret}` };
}

function buildApiSchema(
  requestBodySchema: WebhookToolConfig["apiSchema"]["requestBodySchema"],
  siteUrl?: string
) {
  const headers = appointmentToolHeaders();
  return {
    url: appointmentToolUrl(siteUrl),
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

function callerIdField() {
  return { type: "string", dynamicVariable: CALLER_ID_VARIABLE };
}

function baseBody(action: string) {
  return {
    action: constField(action),
    agentId: agentIdField(),
  };
}

function buildCheckAvailabilityTool(siteUrl?: string): WebhookToolConfig {
  return {
    type: "webhook",
    name: "check_availability",
    description:
      "Prüft live im verbundenen Kalender (Google, Outlook oder Apple), ob ein Slot frei ist. Bei available=true: sofort book_appointment aufrufen — dem Kunden vorher nicht sagen dass eingetragen wird.",
    responseTimeoutSecs: 60,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId"],
      properties: {
        ...baseBody("check_availability"),
        appointmentDate: textField(
          "Termintag YYYY-MM-DD — auch aus «Montag nächste Woche» oder «übermorgen» berechnen"
        ),
        appointmentTime: textField("Uhrzeit HH:mm, z. B. 11:00"),
        startIso: textField(
          "Optional — ISO 8601 Europe/Zurich, z. B. 2026-06-25T11:00:00+02:00"
        ),
        appointmentTypeId: textField(
          "ID der Terminart, z. B. haareschneiden, behandlung, termin"
        ),
        durationMinutes: intField(
          "Optional — Dauer aus Terminart; nicht erfragen bei Haareschneiden (30 Min)"
        ),
      },
    }, siteUrl),
  };
}

function buildBookAppointmentTool(siteUrl?: string): WebhookToolConfig {
  return {
    type: "webhook",
    name: "book_appointment",
    description:
      "Trägt einen Termin im Kalender ein. Nur nach available=true aufrufen. Bei booked:true: Dank + Datum/Uhrzeit bestätigen, dann sofort end_call.",
    responseTimeoutSecs: 90,
    apiSchema: buildApiSchema({
      type: "object",
      required: ["action", "agentId", "attendeeName", "appointmentTypeId"],
      properties: {
        ...baseBody("book_appointment"),
        appointmentDate: textField(
          "Termintag YYYY-MM-DD — aus Kundenangabe berechnen, auch relative Formulierungen"
        ),
        appointmentTime: textField("Uhrzeit HH:mm"),
        appointmentTypeId: textField(
          "ID der Terminart aus der Konfiguration, z. B. termin"
        ),
        title: textField("Optional — Terminart als Text"),
        startIso: textField(
          "Optional — ISO 8601 Europe/Zurich (alternativ appointmentDate + appointmentTime)"
        ),
        durationMinutes: intField("Dauer in Minuten passend zur Terminart"),
        attendeeName: textField("Nachname der Kundin oder des Kunden"),
        attendeePhone: callerIdField(),
        notes: textField(
          "Bemerkung/Sonderwünsche des Kunden — z. B. «Coiffeurin Maria», «Fensterplatz», «nur Stutzen». Immer mitgeben wenn der Kunde etwas Zusätzliches wünscht."
        ),
      },
    }, siteUrl),
  };
}

function buildFindAppointmentsTool(siteUrl?: string): WebhookToolConfig {
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
    }, siteUrl),
  };
}

function buildCancelAppointmentTool(siteUrl?: string): WebhookToolConfig {
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
    }, siteUrl),
  };
}

function buildToolConfigs(
  appointmentConfig?: AppointmentConfig,
  siteUrl?: string
): WebhookToolConfig[] {
  const tools = [
    buildCheckAvailabilityTool(siteUrl),
    buildBookAppointmentTool(siteUrl),
  ];
  if (appointmentConfig?.allowCancellation) {
    tools.push(
      buildFindAppointmentsTool(siteUrl),
      buildCancelAppointmentTool(siteUrl)
    );
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

/** Registers shared Linker appointment webhook tools and returns their IDs. */
export async function ensureAppointmentToolIds(
  client: ElevenLabsClient,
  appointmentConfig?: AppointmentConfig,
  options?: { siteUrl?: string }
): Promise<string[]> {
  const desired = buildToolConfigs(appointmentConfig, options?.siteUrl);
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
