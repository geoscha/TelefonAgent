import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { hasAnyCustomerAccess } from "@/lib/elevenlabs/prompt";
import { getGovernancePromptBlock } from "@/lib/governance/runtime";
import { getWebsiteIntegration } from "@/lib/integrations/website/store";
import {
  applyWorkflowEngineEnforcement,
  resolveMailWorkflowSession,
} from "@/lib/messages/inquiry-workflow-engine";
import { buildWorkflowEngineMessageBlocks } from "@/lib/workflow-engine/prompt-builder";
import type { WorkflowSessionContext } from "@/lib/workflow-engine/session";
import {
  enrichSuggestedActions,
  resolveInquiryCapabilities,
} from "@/lib/messages/inquiry-capabilities";
import {
  listEnabledGovernanceWorkflows,
  resolveInquiryWorkflowAsync,
} from "@/lib/messages/inquiry-workflow-match";
import {
  getEnabledAppointmentTypes,
  normalizeAppointmentConfig,
} from "@/lib/integrations/appointment-config";
import { runTextAssistantAppointmentTool } from "@/lib/text-assistant/appointment-tool";
import type { StoredAgent } from "@/lib/onboarding-types";
import {
  buildCustomerDossiers,
  formatCraftsmenForPrompt,
  formatDossiersForPrompt,
} from "@/lib/messages/inquiry-context";
import { getCraftsmanRecordsForUser } from "@/lib/customers/store";
import {
  enrichCraftsmanDrafts,
  parseCraftsmanDrafts,
} from "@/lib/messages/inquiry-craftsman-drafts";
import {
  formatMatchedCustomersForPrompt,
  matchCustomersFromThread,
} from "@/lib/messages/inquiry-customer-match";
import type {
  CraftsmanEmailDraft,
  CustomerDossier,
  MatchedCustomer,
  MatchedInquiryWorkflow,
  MessageActionStep,
  MessageActionType,
  MessageInquiryCategory,
  MessageInquiryUrgency,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import type { InboundMessage, MessageChannelType } from "@/lib/messages/types";

export interface InquiryAnalysisInput {
  agent: StoredAgent;
  messages: InboundMessage[];
  channelType: MessageChannelType;
  channelRef: string;
  threadId: string;
  userId?: string;
}

export interface InquiryAnalysisResult {
  actionable: boolean;
  category?: MessageInquiryCategory;
  urgency?: MessageInquiryUrgency;
  confidence?: number;
  summary?: string;
  contextSummary?: string;
  draftReply?: string;
  craftsmanDrafts?: CraftsmanEmailDraft[];
  suggestedActions: MessageSuggestedAction[];
  matchedCustomers: MatchedCustomer[];
  dossiers: CustomerDossier[];
  matchedWorkflow?: MatchedInquiryWorkflow;
  workflowSlots?: Record<string, string>;
  workflowRouterConfidence?: number;
}

/** Broad pre-filter — full thread text, not only the latest message. */
const RELEVANCE_PATTERN =
  /termin|besichtig|schlüssel|schluessel|übergabe|uebergabe|handwerker|reparatur|rohrbruch|heizung|lift|storn|absag|verschieb|umbuch|schaden|defekt|kaputt|undicht|wasser|tropf|leck|notfall|mieter|miete|mietzins|nebenkosten|schimmel|fenster|tür|tuer|klingel|briefkasten|waschmaschine|keller|balkon|parkplatz|garage|schloss|auszug|einzug|abnahme|frei|verfügbar|verfuegbar|kalender|uhr|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|öffnungszeit|information|auskunft|frage|kontakt|hausordnung|website|leistung|preis|kosten|adresse|email|telefon|faq|vertrag|kündig|kuendig|foto|photo|bild|einreich|hochlad|anhang|meldung/i;

const MAX_TOOL_ROUNDS = 5;

const CATEGORIES: MessageInquiryCategory[] = [
  "Schadenmeldung",
  "Terminanfrage",
  "Terminänderung",
  "Vertrag/Miete",
  "Allgemein",
  "Notfall",
];
const URGENCIES: MessageInquiryUrgency[] = ["niedrig", "mittel", "hoch"];

function latestInbound(messages: InboundMessage[]): InboundMessage | null {
  const inbound = messages.filter((message) => message.direction === "inbound");
  return inbound.at(-1) ?? null;
}

function threadFullText(messages: InboundMessage[]): string {
  return messages
    .map((message) => {
      const who =
        message.direction === "inbound"
          ? message.senderLabel || message.senderAddress || "Kunde"
          : "Verwaltung";
      const subject = message.subject ? `[Betreff: ${message.subject}] ` : "";
      const at = (() => {
        try {
          return new Intl.DateTimeFormat("de-CH", {
            timeZone: "Europe/Zurich",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(message.receivedAt));
        } catch {
          return "";
        }
      })();
      return `[${at}] ${who}: ${subject}${message.body}`.trim();
    })
    .join("\n\n");
}

function formatThreadForPrompt(messages: InboundMessage[]): string {
  const full = threadFullText(messages);
  return full.length > 14_000 ? full.slice(-14_000) : full;
}

function buildCapabilitiesBlock(agent: StoredAgent): string {
  const parts: string[] = [];
  if (agent.appointmentBookingEnabled) {
    const config = normalizeAppointmentConfig(agent.appointmentConfig);
    const types = getEnabledAppointmentTypes(config)
      .map((entry) => `${entry.id}: ${entry.label} (${entry.durationMinutes} Min.)`)
      .join(", ");
    parts.push(
      `- Kalender: buchen=${config.allowBooking ? "ja" : "nein"}, stornieren/verschieben=${config.allowCancellation ? "ja" : "nein"}`
    );
    if (types) parts.push(`- Terminarten: ${types}`);
  } else {
    parts.push("- Kalender: nicht freigeschaltet (keine Termin-Tools)");
  }
  if (hasAnyCustomerAccess(agent)) {
    parts.push("- Kundendatenbank: Zugriff auf freigegebene Felder (Name/Telefon/Adresse)");
  } else {
    parts.push("- Kundendatenbank: nicht freigeschaltet");
  }
  return parts.join("\n");
}

function nowContext(): string {
  const now = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  return `Aktuelles Datum/Uhrzeit (Europe/Zurich): ${now}.`;
}

// ── Structured-output schema (submit_analysis) ───────────────────────────────

function coerceActionType(value?: string): MessageActionType {
  switch (value) {
    case "book_appointment":
    case "cancel_appointment":
    case "reschedule_appointment":
    case "contact_craftsman":
    case "schedule_repair":
      return value;
    default:
      return "info_only";
  }
}

function coerceCategory(value?: string): MessageInquiryCategory | undefined {
  return CATEGORIES.find((entry) => entry === value);
}

function coerceUrgency(value?: string): MessageInquiryUrgency | undefined {
  return URGENCIES.find((entry) => entry === value);
}

function parseSuggestedActions(raw: unknown): MessageSuggestedAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: MessageSuggestedAction[] = [];
  raw.slice(0, 6).forEach((entry, index) => {
    const item = entry as {
      label?: string;
      type?: string;
      steps?: Array<{ tool?: string; params?: Record<string, unknown> }>;
    };
    if (!item.label?.trim()) return;
    const steps: MessageActionStep[] = (item.steps ?? [])
      .filter((step) => step.tool && step.params)
      .map((step) => ({
        tool: step.tool as MessageActionStep["tool"],
        params: step.params ?? {},
      }));
    actions.push({
      id: `act-${Date.now()}-${index}`,
      label: item.label.trim(),
      type: coerceActionType(item.type),
      status: "pending",
      steps: steps.length > 0 ? steps : undefined,
    });
  });
  return actions;
}

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function dataTools(agent: StoredAgent) {
  const tools: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> = [];

  if (hasAnyCustomerAccess(agent)) {
    tools.push({
      type: "function",
      function: {
        name: "lookup_customer",
        description:
          "Sucht zusätzliche Mieter/Eigentümer in der Kundendatenbank per Name. Nutze dies, wenn ein Name im Text noch nicht im Dossier steht.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Name (Nachname genügt)" },
          },
          required: ["query"],
        },
      },
    });
  }

  if (agent.appointmentBookingEnabled) {
    tools.push({
      type: "function",
      function: {
        name: "find_appointments",
        description:
          "Listet bestehende Termine einer Person an einem Tag (vor Verschiebung/Stornierung prüfen).",
        parameters: {
          type: "object",
          properties: {
            attendeeName: { type: "string" },
            appointmentDate: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["attendeeName", "appointmentDate"],
        },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "check_availability",
        description:
          "Prüft ob ein Slot frei ist, BEVOR du book_appointment vorschlägst. Immer für neue Termine aufrufen.",
        parameters: {
          type: "object",
          properties: {
            appointmentDate: { type: "string", description: "YYYY-MM-DD" },
            appointmentTime: { type: "string", description: "HH:mm (24h)" },
            durationMinutes: { type: "number" },
          },
          required: ["appointmentDate", "appointmentTime"],
        },
      },
    });
  }

  return tools;
}

function submitAnalysisTool() {
  return {
    type: "function" as const,
    function: {
      name: "submit_analysis",
      description:
        "Gib die finale Analyse ab. Rufe dies GENAU EINMAL auf, nachdem du alle nötigen Daten geprüft hast.",
      parameters: {
        type: "object",
        properties: {
          actionable: {
            type: "boolean",
            description:
              "true, wenn es eine bearbeitbare Mieter-/Kundenanfrage ist (Schaden, Termin, Vertrag/Miete-Anliegen mit Handlungsbedarf). false bei Spam/Werbung/Newsletter/reiner Info.",
          },
          category: { type: "string", enum: CATEGORIES },
          urgency: { type: "string", enum: URGENCIES },
          confidence: {
            type: "number",
            description: "0–1: Sicherheit, dass Einschätzung & Entwurf korrekt sind.",
          },
          summary: { type: "string", description: "1 Satz, worum es geht (Deutsch)." },
          context_summary: {
            type: "string",
            description:
              "Kurz: was über den Kunden & die Historie bekannt ist (relevante frühere Termine/Handwerker/Anliegen). Leer lassen, wenn nichts bekannt.",
          },
          draft_reply: {
            type: "string",
            description:
              "Versandfertige, höfliche Antwort (Sie-Form). Nutze Name & Kontext. Bei Schaden empathisch + nächste Schritte.",
          },
          suggested_actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "book_appointment",
                    "cancel_appointment",
                    "reschedule_appointment",
                    "contact_craftsman",
                    "schedule_repair",
                    "info_only",
                  ],
                },
                steps: {
                  type: "array",
                  description:
                    "Auszuführende Tool-Schritte bei Bestätigung. Nur geprüfte (freie) Slots verwenden.",
                  items: {
                    type: "object",
                    properties: {
                      tool: {
                        type: "string",
                        enum: ["book_appointment", "cancel_appointment", "check_availability"],
                      },
                      params: { type: "object" },
                    },
                    required: ["tool", "params"],
                  },
                },
              },
              required: ["label", "type"],
            },
          },
          craftsman_drafts: {
            type: "array",
            description:
              "Bei Schaden/Notfall/Reparatur: E-Mail-Entwürfe an passende Handwerker aus HANDWERKER-STAMM. recipient_email MUSS exakt aus dieser Liste stammen.",
            items: {
              type: "object",
              properties: {
                recipient_name: { type: "string" },
                recipient_email: {
                  type: "string",
                  description: "E-Mail aus HANDWERKER-STAMM (Pflicht).",
                },
                trade: { type: "string" },
                subject: { type: "string" },
                body: {
                  type: "string",
                  description: "Versandfertige E-Mail an den Handwerker (Sie-Form).",
                },
              },
              required: ["recipient_name", "recipient_email", "subject", "body"],
            },
          },
          matched_workflow_slug: {
            type: "string",
            description:
              "Slug des passenden Admin-Workflows: schadensfall-meldung oder allgemeine-auskunft.",
          },
          workflow_slots: {
            type: "object",
            description:
              "Extrahierte Workflow-Felder (z. B. inquiry_topic, damage_type, urgency).",
            additionalProperties: { type: "string" },
          },
        },
        required: ["actionable", "summary", "draft_reply", "suggested_actions"],
      },
    },
  };
}

interface SubmitArgs {
  actionable?: boolean;
  category?: string;
  urgency?: string;
  confidence?: number;
  summary?: string;
  context_summary?: string;
  draft_reply?: string;
  suggested_actions?: unknown;
  craftsman_drafts?: unknown;
  matched_workflow_slug?: string;
  workflow_slots?: Record<string, string>;
}

function parseWorkflowSlots(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const slots: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      slots[key] = value.trim();
    }
  }
  return Object.keys(slots).length > 0 ? slots : undefined;
}

function resultFromSubmit(
  args: SubmitArgs,
  matchedCustomers: MatchedCustomer[],
  dossiers: CustomerDossier[]
): InquiryAnalysisResult {
  const actionable = Boolean(args.actionable);
  return {
    actionable,
    category: coerceCategory(args.category),
    urgency: coerceUrgency(args.urgency),
    confidence:
      typeof args.confidence === "number"
        ? Math.max(0, Math.min(1, args.confidence))
        : undefined,
    summary: args.summary?.trim() || (actionable ? "Bearbeitbare Anfrage" : undefined),
    contextSummary: args.context_summary?.trim() || undefined,
    draftReply: actionable ? args.draft_reply?.trim() : undefined,
    suggestedActions: actionable ? parseSuggestedActions(args.suggested_actions) : [],
    matchedCustomers,
    dossiers,
    workflowSlots: actionable ? parseWorkflowSlots(args.workflow_slots) : undefined,
    _rawCraftsmanDrafts: actionable ? args.craftsman_drafts : undefined,
    _llmWorkflowSlug: actionable ? args.matched_workflow_slug?.trim() : undefined,
  } as InquiryAnalysisResult & {
    _rawCraftsmanDrafts?: unknown;
    _llmWorkflowSlug?: string;
  };
}

async function finalizeCraftsmanDrafts(
  result: InquiryAnalysisResult & { _rawCraftsmanDrafts?: unknown },
  input: InquiryAnalysisInput
): Promise<InquiryAnalysisResult> {
  const { _rawCraftsmanDrafts, ...rest } = result;
  if (!rest.actionable || !input.userId) return rest;

  const craftsmen = await getCraftsmanRecordsForUser(input.userId);
  const parsed = parseCraftsmanDrafts(_rawCraftsmanDrafts, craftsmen);
  const craftsmanDrafts = enrichCraftsmanDrafts({
    craftsmanDrafts: parsed,
    messages: input.messages,
    craftsmen,
    category: rest.category,
    suggestedActions: rest.suggestedActions,
    customerName: rest.matchedCustomers[0]?.name,
    customerAddress: rest.matchedCustomers[0]?.address,
  });

  return { ...rest, craftsmanDrafts };
}

async function finalizeWorkflowAndActions(
  result: InquiryAnalysisResult & { _llmWorkflowSlug?: string },
  input: InquiryAnalysisInput,
  workflowSession?: WorkflowSessionContext | null
): Promise<InquiryAnalysisResult> {
  const { _llmWorkflowSlug, ...rest } = result;
  if (!rest.actionable) return rest;

  let processed = rest;

  if (
    workflowSession?.definition &&
    workflowSession.execution &&
    input.userId
  ) {
    const enforced = await applyWorkflowEngineEnforcement({
      result: processed,
      session: workflowSession,
      userId: input.userId,
    });
    processed = {
      ...processed,
      draftReply: enforced.draftReply,
      suggestedActions: enforced.suggestedActions,
      craftsmanDrafts: enforced.craftsmanDrafts,
      workflowSlots: enforced.workflowSlots,
      matchedWorkflow: enforced.matchedWorkflow,
      workflowRouterConfidence: enforced.workflowRouterConfidence,
    };
  } else {
    const workflows = await listEnabledGovernanceWorkflows(input.userId);
    const matchedWorkflow = await resolveInquiryWorkflowAsync({
      category: processed.category,
      urgency: processed.urgency,
      threadText: threadFullText(input.messages),
      workflows,
      llmWorkflowSlug: _llmWorkflowSlug,
      userId: input.userId,
    });
    processed = { ...processed, matchedWorkflow };
  }

  const capabilities = await resolveInquiryCapabilities({
    channelType: input.channelType,
    agent: input.agent,
  });

  return {
    ...processed,
    suggestedActions: enrichSuggestedActions(processed.suggestedActions, capabilities),
  };
}

function buildWebsiteKnowledgeBlock(
  knowledgeText: string | null | undefined
): string {
  if (!knowledgeText?.trim()) return "";
  return `\n\nWISSENSDATENBANK (Betreiber-Website / FAQ):\n${knowledgeText.trim()}\n\nNutze diese Fakten für allgemeine Auskünfte. Wenn etwas nicht hier steht, nicht erfinden.`;
}

function buildWorkflowInstructionsBlock(
  workflowSession: WorkflowSessionContext | null
): string {
  if (workflowSession?.definition) {
    return `Workflow (bereits zugeordnet):
- matched_workflow_slug: ${workflowSession.definition.slug} (read-only — exakt so in submit_analysis übergeben)
- workflow_slots: Fülle die Pflichtfelder des aktiven Workflows (siehe oben). Nur extrahieren, was im Verlauf steht — fehlende Felder im draft_reply erfragen.
- Solange Pflichtfelder fehlen: KEINE Handwerker-Dispatch-Aktionen (contact_craftsman/schedule_repair) und keine craftsman_drafts vorschlagen.`;
  }

  return `Workflow-Zuordnung:
- matched_workflow_slug=schadensfall-meldung bei Schaden/Defekt/Notfall/Reparatur
- matched_workflow_slug=allgemeine-auskunft bei allgemeinen Informationsfragen (Öffnungszeiten, Leistungen, Kontakt, Nebenkosten, Hausordnung)
- workflow_slots: relevante Felder aus dem passenden Workflow füllen (z. B. inquiry_topic, damage_type)`;
}

async function runAgentLoop(
  input: InquiryAnalysisInput,
  matchedCustomers: MatchedCustomer[],
  dossiers: CustomerDossier[]
): Promise<InquiryAnalysisResult> {
  const config = await getEnrichmentConfig();
  if (!config.apiKey) throw new Error("missing key");

  const tools = [...dataTools(input.agent), submitAnalysisTool()];
  const dossierBlock = formatDossiersForPrompt(dossiers);
  const craftsmenBlock = input.userId
    ? formatCraftsmenForPrompt(await getCraftsmanRecordsForUser(input.userId))
    : "";
  const matchBlock = dossiers.length === 0
    ? formatMatchedCustomersForPrompt(matchedCustomers)
    : "";

  const workflowSession = await resolveMailWorkflowSession({
    userId: input.userId,
    threadId: input.threadId,
    threadText: threadFullText(input.messages),
    agentId: input.agent.id,
  });
  const governanceBlock = workflowSession?.definition
    ? await buildWorkflowEngineMessageBlocks({
        userId: input.userId,
        definition: workflowSession.definition,
        execution: workflowSession.execution,
        compiledWorkflowBlock: workflowSession.compiledMessageBlock,
      })
    : await getGovernancePromptBlock("message", input.userId);
  const workflowInstructions = buildWorkflowInstructionsBlock(workflowSession);
  const websiteIntegration = input.userId
    ? await getWebsiteIntegration()
    : null;
  const knowledgeBlock = buildWebsiteKnowledgeBlock(
    websiteIntegration?.knowledgeText
  );

  const system = `Du bist ein erfahrener Sachbearbeiter einer Schweizer Liegenschaftsverwaltung und triagierst eingehende Mieter-/Kundennachrichten.

${nowContext()}

${governanceBlock ? `${governanceBlock}\n\n` : ""}Lies den GESAMTEN Nachrichtenverlauf gründlich. Nutze das beigefügte Kunden-Dossier (Stammdaten, frühere Termine, welcher Handwerker wann da war, vergangene Anliegen). Wenn Daten fehlen, kannst du die Tools aufrufen:
- lookup_customer: weitere Personen in der Datenbank finden
- find_appointments: bestehende Termine prüfen (vor Verschieben/Stornieren)
- check_availability: freien Slot prüfen, BEVOR du einen neuen Termin vorschlägst

Vorgehen:
1. Verstehe das Anliegen und den Kontext (Historie!).
2. Prüfe nötige Fakten mit Tools (nur wenn relevant).
3. Rufe danach GENAU EINMAL submit_analysis auf.

${workflowInstructions}

Klassifizierung:
- actionable=true bei: Schadenmeldung, Terminanfrage/-änderung, Vertrags-/Mietanliegen mit Handlungsbedarf, Ablauf-/Informationsfragen (z. B. «Wie reiche ich Fotos ein?»), allgemeine Auskünfte aus der Wissensdatenbank, oder wenn ein bekannter Mieter ein konkretes Anliegen hat.
- actionable=false bei: Werbung, Newsletter, Spam, automatische Systemmails ohne Antwortbedarf, oder wenn die letzte Nachricht bereits von der Verwaltung final beantwortet wurde.

Verfügbare Fähigkeiten der Verwaltung:
${buildCapabilitiesBlock(input.agent)}

Regeln für die Antwort (draft_reply):
- draft_reply ist IMMER Pflicht bei actionable=true — niemals leer lassen.
- Sie-Form, höflich, konkret, mit Bezug auf Name & Kontext.
- Nutze die WISSENSDATENBANK für Ablauf-, FAQ- und Prozessfragen (z. B. Foto-Einreichung, Öffnungszeiten). Wenn die KB eine Antwort enthält, formuliere sie natürlich um.
- Bei Schäden: Empathie + konkrete nächste Schritte (z. B. Handwerker organisieren, Termin vorschlagen).
- Bei Fragen zum Einreichen von Fotos/Dokumenten zu einer Schadenmeldung: erkläre den Weg aus der Wissensdatenbank; falls dort nichts steht, antworte dass Fotos als Anhang auf diese E-Mail geantwortet werden können (mit Adresse/Kurzbeschreibung).
- Schlage in suggested_actions nur Termine vor, deren Slot du mit check_availability geprüft hast.
- Für Verschiebungen: cancel_appointment + book_appointment als zwei steps; zusätzlich contact_craftsman erwähnen.
- Bei Schadenmeldung/Notfall/Reparatur: wähle einen passenden Handwerker aus HANDWERKER-STAMM (Gewerk!) und erstelle in craftsman_drafts eine versandfertige E-Mail an dessen hinterlegte Adresse. Ergänze contact_craftsman oder schedule_repair in suggested_actions.`;

  const messages: OpenAiMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `NACHRICHTENVERLAUF:\n\n${formatThreadForPrompt(input.messages)}${dossierBlock}${craftsmenBlock}${matchBlock}${knowledgeBlock}`,
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages,
        tools,
        tool_choice: lastRound
          ? { type: "function", function: { name: "submit_analysis" } }
          : "auto",
      }),
    });

    if (!response.ok) {
      throw new Error(`Analysis HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
      }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Leere OpenAI-Antwort.");

    const toolCalls = message.tool_calls ?? [];
    const submit = toolCalls.find((call) => call.function.name === "submit_analysis");
    if (submit) {
      let args: SubmitArgs = {};
      try {
        args = JSON.parse(submit.function.arguments || "{}") as SubmitArgs;
      } catch {
        args = {};
      }
      if (workflowSession?.definition?.slug) {
        args.matched_workflow_slug = workflowSession.definition.slug;
      }
      return finalizeWorkflowAndActions(
        await finalizeCraftsmanDrafts(
          resultFromSubmit(args, matchedCustomers, dossiers),
          input
        ),
        input,
        workflowSession
      );
    }

    if (toolCalls.length === 0) {
      // Model answered in prose; nudge it toward the structured submission.
      messages.push({ role: "assistant", content: message.content ?? null });
      messages.push({
        role: "user",
        content: "Bitte rufe jetzt submit_analysis mit deiner finalen Einschätzung auf.",
      });
      continue;
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        toolArgs = {};
      }
      const toolResult = await runTextAssistantAppointmentTool(
        input.agent.id,
        call.function.name,
        toolArgs
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  throw new Error("submit_analysis nicht erhalten.");
}

// ── Heuristic fallback (no API key / failure) ────────────────────────────────

function extractKnowledgeSnippet(
  knowledgeText: string | undefined,
  keywords: string[]
): string | undefined {
  if (!knowledgeText?.trim()) return undefined;

  const chunks = knowledgeText
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const match = chunks.find((chunk) => {
    const lower = chunk.toLowerCase();
    return lowerKeywords.some((keyword) => lower.includes(keyword));
  });

  return match?.slice(0, 600);
}

function buildHeuristicDraftReply(input: {
  text: string;
  name: string;
  category: MessageInquiryCategory;
  knowledgeText?: string;
}): string {
  const firstName = input.name.split(/\s+/)[0] || input.name;
  const greeting = `Guten Tag ${firstName}`;

  if (/foto|photo|bild|einreich|hochlad|anhang/i.test(input.text)) {
    const kbSnippet = extractKnowledgeSnippet(input.knowledgeText, [
      "foto",
      "bild",
      "einreich",
      "anhang",
      "schaden",
      "meldung",
      "upload",
    ]);

    if (kbSnippet) {
      return `${greeting}\n\nvielen Dank für Ihre Nachricht. ${kbSnippet}\n\nFreundliche Grüsse\nIhre Liegenschaftsverwaltung`;
    }

    return `${greeting}\n\nvielen Dank für Ihre Nachricht. Sie können die Fotos zu Ihrer Schadenmeldung gerne als Anhang direkt auf diese E-Mail antworten. Bitte fügen Sie wenn möglich eine kurze Beschreibung und die betroffene Adresse bei.\n\nFreundliche Grüsse\nIhre Liegenschaftsverwaltung`;
  }

  if (
    input.category === "Allgemein" ||
    /öffnungszeit|information|auskunft|hausordnung|nebenkosten|kontakt|website|faq/i.test(
      input.text
    )
  ) {
    const kbSnippet = extractKnowledgeSnippet(input.knowledgeText, [
      "öffnung",
      "kontakt",
      "nebenkosten",
      "hausordnung",
      "miete",
      "service",
      "information",
    ]);

    if (kbSnippet) {
      return `${greeting}\n\nvielen Dank für Ihre Nachricht. ${kbSnippet}\n\nFreundliche Grüsse\nIhre Liegenschaftsverwaltung`;
    }
  }

  return `${greeting}\n\nvielen Dank für Ihre Nachricht. Wir haben Ihr Anliegen aufgenommen und kümmern uns umgehend darum. Sie hören in Kürze von uns.\n\nFreundliche Grüsse\nIhre Liegenschaftsverwaltung`;
}

function heuristicAnalysis(
  input: InquiryAnalysisInput,
  matchedCustomers: MatchedCustomer[],
  dossiers: CustomerDossier[],
  knowledgeText?: string
): InquiryAnalysisResult {
  const text = threadFullText(input.messages);
  const hasCustomerMatch = matchedCustomers.length > 0;
  const actionable = RELEVANCE_PATTERN.test(text) || hasCustomerMatch;

  if (!actionable) {
    return { actionable: false, suggestedActions: [], matchedCustomers, dossiers };
  }

  const name = matchedCustomers[0]?.name || latestInbound(input.messages)?.senderLabel?.trim() || "Kunde";
  const actions: MessageSuggestedAction[] = [];
  let category: MessageInquiryCategory = "Allgemein";
  let urgency: MessageInquiryUrgency = "mittel";

  if (/feuer|brand|gas|überschwemm|notfall|gefahr/i.test(text)) {
    category = "Notfall";
    urgency = "hoch";
    actions.push({
      id: `act-${Date.now()}-craft`,
      label: "Notfall — Handwerker/Pikett sofort kontaktieren",
      type: "contact_craftsman",
      status: "pending",
    });
  } else if (/schaden|defekt|kaputt|undicht|wasser|tropf|leck|rohrbruch|heizung|schimmel/i.test(text)) {
    category = "Schadenmeldung";
    urgency = "hoch";
    actions.push(
      {
        id: `act-${Date.now()}-repair`,
        label: "Handwerkertermin koordinieren",
        type: "schedule_repair",
        status: "pending",
      },
      {
        id: `act-${Date.now()}-craft`,
        label: "Handwerker informieren",
        type: "contact_craftsman",
        status: "pending",
      }
    );
  } else if (/storn|absag|lösch|loesch/i.test(text)) {
    category = "Terminänderung";
    actions.push({
      id: `act-${Date.now()}-cancel`,
      label: "Termin stornieren",
      type: "cancel_appointment",
      status: "pending",
    });
  } else if (/verschieb|umbuch|anderer tag|andere uhrzeit/i.test(text)) {
    category = "Terminänderung";
    actions.push(
      {
        id: `act-${Date.now()}-move`,
        label: "Termin verschieben",
        type: "reschedule_appointment",
        status: "pending",
      },
      {
        id: `act-${Date.now()}-craft`,
        label: "Handwerker über Verschiebung informieren",
        type: "contact_craftsman",
        status: "pending",
      }
    );
  } else if (/termin|besichtig|schlüssel|schluessel|übergabe|handwerker|reparatur/i.test(text)) {
    category = "Terminanfrage";
    actions.push({
      id: `act-${Date.now()}-book`,
      label: "Termin eintragen",
      type: "book_appointment",
      status: "pending",
    });
  } else if (/miete|mietzins|nebenkosten|vertrag|kündig|kuendig/i.test(text)) {
    category = "Vertrag/Miete";
  }

  const dossier = dossiers[0];
  const contextBits: string[] = [];
  if (dossier?.appointments.length) {
    const last = dossier.appointments.find((a) => a.when === "past");
    if (last) contextBits.push(`Letzter Termin: ${last.title}`);
  }
  if (dossier?.concerns.length) {
    contextBits.push(`${dossier.concerns.length} frühere(s) Anliegen`);
  }

  return {
    actionable: true,
    category,
    urgency,
    confidence: 0.4,
    summary: `${category} von ${name}${matchedCustomers[0]?.address ? ` · ${matchedCustomers[0].address}` : ""}.`,
    contextSummary: contextBits.length > 0 ? contextBits.join(" · ") : undefined,
    draftReply: buildHeuristicDraftReply({
      text,
      name,
      category,
      knowledgeText,
    }),
    suggestedActions: actions,
    matchedCustomers,
    dossiers,
  };
}

export async function analyzeMessageInquiry(
  input: InquiryAnalysisInput
): Promise<InquiryAnalysisResult> {
  const latest = latestInbound(input.messages);
  if (!latest) {
    return { actionable: false, suggestedActions: [], matchedCustomers: [], dossiers: [] };
  }

  const matchedCustomers = await matchCustomersFromThread(input.messages);
  const dossiers = await buildCustomerDossiers({
    matched: matchedCustomers,
    messages: input.messages,
    channelType: input.channelType,
    channelRef: input.channelRef,
    threadId: input.threadId,
  });

  const websiteIntegration = input.userId
    ? await getWebsiteIntegration()
    : null;
  const knowledgeText = websiteIntegration?.knowledgeText;

  if (!(await getEnrichmentConfig()).apiKey) {
    return finalizeWorkflowAndActions(
      await finalizeCraftsmanDrafts(
        heuristicAnalysis(input, matchedCustomers, dossiers, knowledgeText),
        input
      ),
      input
    );
  }

  try {
    const result = await runAgentLoop(input, matchedCustomers, dossiers);
    return polishAnalysisResult(
      result,
      input,
      matchedCustomers,
      dossiers,
      knowledgeText
    );
  } catch (error) {
    console.error("[message-inquiry] agent failed, using heuristics:", error);
    return finalizeWorkflowAndActions(
      await finalizeCraftsmanDrafts(
        heuristicAnalysis(input, matchedCustomers, dossiers, knowledgeText),
        input
      ),
      input
    );
  }
}

async function polishAnalysisResult(
  result: InquiryAnalysisResult,
  input: InquiryAnalysisInput,
  matchedCustomers: MatchedCustomer[],
  dossiers: CustomerDossier[],
  knowledgeText?: string
): Promise<InquiryAnalysisResult> {
  if (!isLikelyActionableThread(input.messages)) {
    return result;
  }

  let polished = result;

  if (!polished.actionable) {
    polished = heuristicAnalysis(
      input,
      matchedCustomers,
      dossiers,
      knowledgeText
    );
    polished = await finalizeCraftsmanDrafts(polished, input);
    return finalizeWorkflowAndActions(polished, input);
  }

  if (!polished.draftReply?.trim()) {
    const name =
      matchedCustomers[0]?.name ||
      latestInbound(input.messages)?.senderLabel?.trim() ||
      "Kunde";
    polished = {
      ...polished,
      draftReply: buildHeuristicDraftReply({
        text: threadFullText(input.messages),
        name,
        category: polished.category ?? "Allgemein",
        knowledgeText,
      }),
    };
  }

  return polished;
}

/** Quick check whether a thread is worth sending to ChatGPT (full thread, not just latest). */
export function isLikelyActionableThread(messages: InboundMessage[]): boolean {
  const inbound = messages.filter((message) => message.direction === "inbound");
  if (inbound.length === 0) return false;
  return RELEVANCE_PATTERN.test(threadFullText(messages));
}
