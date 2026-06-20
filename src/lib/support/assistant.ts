import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { createUserRequest } from "@/lib/admin/requests";
import {
  findSupportNavPage,
  LINKER_PRODUCT_KNOWLEDGE,
  SUPPORT_NAV_PAGES,
} from "@/lib/support/knowledge";
import { buildSupportUserContext } from "@/lib/support/user-context";

export type SupportChatRole = "user" | "assistant";

export interface SupportChatTurn {
  role: SupportChatRole;
  content: string;
}

export interface SupportNavigationProposal {
  path: string;
  label: string;
}

export interface SupportAssistantResult {
  reply: string;
  history: SupportChatTurn[];
  navigation?: SupportNavigationProposal;
  escalated: boolean;
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

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_TURNS = 20;

export class SupportAssistantUnavailableError extends Error {
  constructor(message = "OpenAI ist nicht konfiguriert (ENRICHMENT_API_KEY).") {
    super(message);
    this.name = "SupportAssistantUnavailableError";
  }
}

export async function isSupportAssistantEnabled(): Promise<boolean> {
  const config = await getEnrichmentConfig();
  return Boolean(config.apiKey);
}

function buildSupportSystemPrompt(userContext: string): string {
  const pageList = SUPPORT_NAV_PAGES.map(
    (page) => `- ${page.path} — ${page.label}: ${page.description}`
  ).join("\n");

  return `Du bist der **Support-Assistent von Linker** – ein freundlicher, präziser Helfer **innerhalb der Linker-App** für den angemeldeten Nutzer (Geschäftskunde). Antworte immer auf Deutsch, in der Sie-Form, kurz und konkret.

# Deine einzige Wissensquelle
- Beantworte **ausschliesslich** Fragen zu **Linker** (dem Produkt) und zur **Konfiguration dieses Nutzers**.
- Nutze **nur** das unten stehende interne Wissen und den Konfigurations-Snapshot. **Keine** Internet-Recherche, **kein** Allgemeinwissen, keine erfundenen Funktionen.
- Wenn etwas nicht durch das interne Wissen abgedeckt ist oder du es nicht sicher weisst, sage das offen und biete an, an einen Menschen weiterzuleiten.
- Bei Fragen, die nichts mit Linker zu tun haben: höflich ablehnen und auf Linker-Themen zurückführen.

# Weiterleitung an einen Menschen
- Sobald der Nutzer mit einem Menschen sprechen möchte (z. B. „mit einem Mitarbeiter", „echte Person", „Mensch", „Support-Team") **oder** du nicht weiterhelfen kannst, rufe das Tool **escalate_to_human** auf.
- Bestätige danach kurz, dass das Support-Team informiert wurde und sich melden wird.

# Navigation (nur mit Erlaubnis)
- Du kannst den Nutzer zu passenden Seiten/Unterseiten führen. **Frage aber zuerst um Erlaubnis** („Soll ich Sie dorthin bringen?").
- Erst wenn der Nutzer **zustimmt**, rufe das Tool **propose_navigation** mit dem passenden Pfad auf. Navigiere **niemals** ungefragt.
- Erlaubte Ziele (keine anderen Pfade verwenden):
${pageList}

# Stil
- 1–4 Sätze pro Antwort. Verständlich, ohne Fachjargon. Biete bei Bedarf konkrete nächste Schritte an.

# Internes Linker-Wissen
${LINKER_PRODUCT_KNOWLEDGE}

# Konfiguration dieses Nutzers (aktuell)
${userContext || "(keine Daten verfügbar)"}`;
}

const SUPPORT_TOOLS = [
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Leitet das Anliegen an das menschliche Support-Team weiter. Aufrufen, sobald der Nutzer mit einem Menschen sprechen möchte oder die Frage nicht aus dem internen Wissen beantwortet werden kann.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "Kurze Zusammenfassung des Anliegens des Nutzers (1-2 Sätze, Deutsch).",
          },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_navigation",
      description:
        "Führt den Nutzer zu einer Seite in der Linker-App. NUR aufrufen, nachdem der Nutzer der Navigation ausdrücklich zugestimmt hat.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Zielpfad, exakt einer der erlaubten Pfade (z. B. /telefonagent, /phones).",
          },
        },
        required: ["path"],
      },
    },
  },
] as const;

export async function runSupportAssistantTurn(input: {
  userId: string;
  history: SupportChatTurn[];
  userMessage: string;
}): Promise<SupportAssistantResult> {
  const config = await getEnrichmentConfig();
  if (!config.apiKey) {
    throw new SupportAssistantUnavailableError();
  }

  const userContext = await buildSupportUserContext();
  const trimmedHistory = input.history.slice(-MAX_HISTORY_TURNS);

  const openAiMessages: OpenAiMessage[] = [
    { role: "system", content: buildSupportSystemPrompt(userContext) },
    ...trimmedHistory.map(
      (turn) =>
        ({ role: turn.role, content: turn.content }) as OpenAiMessage
    ),
    { role: "user", content: input.userMessage.trim() },
  ];

  let reply = "";
  let navigation: SupportNavigationProposal | undefined;
  let escalated = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: openAiMessages,
        tools: SUPPORT_TOOLS,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: ToolCall[] };
      }>;
    };

    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Leere OpenAI-Antwort.");

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

        let toolResult: Record<string, unknown> = { ok: false };

        if (call.function.name === "escalate_to_human") {
          const summary =
            typeof args.summary === "string" && args.summary.trim()
              ? args.summary.trim()
              : input.userMessage.trim();
          try {
            await createUserRequest(input.userId, "support", {
              message: summary,
              source: "support_chat",
            });
            escalated = true;
            toolResult = { ok: true, escalated: true };
          } catch (error) {
            console.error("[support/assistant] escalation failed", error);
            toolResult = { ok: false, error: "escalation_failed" };
          }
        } else if (call.function.name === "propose_navigation") {
          const path = typeof args.path === "string" ? args.path : "";
          const page = findSupportNavPage(path);
          if (page) {
            navigation = { path: page.path, label: page.label };
            toolResult = { ok: true, path: page.path, label: page.label };
          } else {
            toolResult = { ok: false, error: "unknown_path" };
          }
        }

        openAiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }

      continue;
    }

    reply = message.content?.trim() ?? "";
    break;
  }

  if (!reply) {
    reply = escalated
      ? "Ich habe Ihr Anliegen an unser Support-Team weitergeleitet. Es meldet sich zeitnah bei Ihnen."
      : navigation
        ? `Ich bringe Sie zu „${navigation.label}".`
        : "Entschuldigung, das konnte ich gerade nicht beantworten. Soll ich Sie mit einem Menschen verbinden?";
  }

  const nextHistory: SupportChatTurn[] = [
    ...input.history,
    { role: "user", content: input.userMessage.trim() },
    { role: "assistant", content: reply },
  ];

  return { reply, history: nextHistory, navigation, escalated };
}
