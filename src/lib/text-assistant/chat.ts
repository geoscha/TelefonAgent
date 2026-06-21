import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { runTextAssistantAppointmentTool } from "@/lib/text-assistant/appointment-tool";
import {
  buildTextAssistantSystemPromptAsync,
  type TextChannelKind,
} from "@/lib/text-assistant/prompt";
import { textAssistantTools } from "@/lib/text-assistant/tools";
import type { BookedAppointmentInfo } from "@/lib/text-assistant/types";
import type { StoredAgent } from "@/lib/onboarding-types";

export type TextChatRole = "user" | "assistant";

export interface TextChatTurn {
  role: TextChatRole;
  content: string;
}

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const MAX_TOOL_ROUNDS = 6;

export class TextAssistantUnavailableError extends Error {
  constructor(message = "OpenAI ist nicht konfiguriert (ENRICHMENT_API_KEY).") {
    super(message);
    this.name = "TextAssistantUnavailableError";
  }
}

export async function isTextAssistantEnabled(): Promise<boolean> {
  const config = await getEnrichmentConfig();
  return Boolean(config.apiKey);
}

export async function runTextAssistantTurn(input: {
  agent: StoredAgent;
  history: TextChatTurn[];
  userMessage: string;
  channel?: TextChannelKind;
  userId?: string;
}): Promise<{
  reply: string;
  history: TextChatTurn[];
  goalCompleted: boolean;
  bookedAppointment?: BookedAppointmentInfo;
}> {
  const config = await getEnrichmentConfig();
  if (!config.apiKey) {
    throw new TextAssistantUnavailableError();
  }

  const tools = textAssistantTools(input.agent);
  const systemPrompt = await buildTextAssistantSystemPromptAsync(
    input.agent,
    input.channel,
    input.userId
  );
  const openAiMessages: OpenAiMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...input.history.map(
      (turn) =>
        ({
          role: turn.role,
          content: turn.content,
        }) as OpenAiMessage
    ),
    { role: "user", content: input.userMessage.trim() },
  ];

  let goalCompleted = false;
  let bookedAppointment: BookedAppointmentInfo | undefined;
  let reply = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: openAiMessages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: ToolCall[];
        };
      }>;
    };

    const message = json.choices?.[0]?.message;
    if (!message) {
      throw new Error("Leere OpenAI-Antwort.");
    }

    if (message.tool_calls?.length) {
      openAiMessages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });

      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }

        const result = await runTextAssistantAppointmentTool(
          input.agent.id,
          call.function.name,
          args
        );

        if (call.function.name === "book_appointment" && result.booked === true) {
          goalCompleted = true;
          const eventId =
            typeof result.eventId === "string" ? result.eventId : undefined;
          const startIso =
            typeof result.resolvedStartIso === "string"
              ? result.resolvedStartIso
              : undefined;
          if (eventId && startIso) {
            bookedAppointment = {
              eventId,
              startIso,
              appointmentType:
                typeof result.appointmentType === "string"
                  ? result.appointmentType
                  : undefined,
              message:
                typeof result.message === "string" ? result.message : undefined,
            };
          }
        }
        if (
          call.function.name === "cancel_appointment" &&
          result.cancelled === true
        ) {
          goalCompleted = true;
        }

        openAiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    reply = message.content?.trim() ?? "";
    break;
  }

  if (!reply) {
    reply =
      "Entschuldigung, ich konnte Ihre Anfrage gerade nicht bearbeiten. Bitte versuchen Sie es erneut.";
  }

  const nextHistory: TextChatTurn[] = [
    ...input.history,
    { role: "user", content: input.userMessage.trim() },
    { role: "assistant", content: reply },
  ];

  return { reply, history: nextHistory, goalCompleted, bookedAppointment };
}
