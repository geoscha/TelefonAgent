import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

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

function workflowToolUrl(siteUrl?: string): string {
  const base = siteUrl?.replace(/\/$/, "") || getSiteUrl();
  return `${base}/api/agent-tools/workflow-context`;
}

function toolHeaders(): Record<string, string> | undefined {
  const secret = process.env.AGENT_TOOL_SECRET?.trim();
  if (!secret) return undefined;
  return { Authorization: `Bearer ${secret}` };
}

function agentIdField() {
  return { type: "string", dynamicVariable: AGENT_ID_VARIABLE };
}

function callerIdField() {
  return { type: "string", dynamicVariable: CALLER_ID_VARIABLE };
}

function buildWorkflowContextTool(siteUrl?: string): WebhookToolConfig {
  return {
    type: "webhook",
    name: "get_workflow_context",
    description:
      "Lädt den aktiven Workflow, fehlende Pflichtfelder und Instruktionen für das Anliegen des Anrufers. Zu Beginn des Gesprächs und bei Themenwechsel aufrufen.",
    responseTimeoutSecs: 30,
    apiSchema: {
      url: workflowToolUrl(siteUrl),
      method: "POST",
      contentType: "application/json",
      ...(toolHeaders() ? { requestHeaders: toolHeaders() } : {}),
      requestBodySchema: {
        type: "object",
        required: ["agentId", "inquirySummary"],
        properties: {
          agentId: agentIdField(),
          callerId: callerIdField(),
          inquirySummary: {
            type: "string",
            description:
              "Kurze Zusammenfassung des Anliegens des Anrufers in 1–2 Sätzen",
          },
          conversationId: {
            type: "string",
            description: "Optional — ElevenLabs conversation ID",
          },
        },
      },
    },
  };
}

async function listWorkspaceWebhookTools(client: ElevenLabsClient) {
  const response = (await client.conversationalAi.tools.list({
    types: ["webhook"],
    pageSize: 100,
  })) as { tools?: { id: string; toolConfig?: { name?: string } }[] };

  return response.tools ?? [];
}

export async function ensureWorkflowContextToolId(
  client: ElevenLabsClient,
  siteUrl?: string
): Promise<string | undefined> {
  const config = buildWorkflowContextTool(siteUrl);
  const existing = await listWorkspaceWebhookTools(client);
  const found = existing.find((tool) => tool.toolConfig?.name === config.name);

  if (found?.id) {
    await client.conversationalAi.tools.update(found.id, {
      toolConfig: config,
    } as Parameters<typeof client.conversationalAi.tools.update>[1]);
    return found.id;
  }

  const created = (await client.conversationalAi.tools.create({
    toolConfig: config,
  } as Parameters<typeof client.conversationalAi.tools.create>[0])) as {
    id: string;
  };

  return created.id;
}
