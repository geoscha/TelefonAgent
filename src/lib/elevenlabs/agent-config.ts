import {
  composeBehaviorSystemPrompt,
  parseSystemPrompt,
} from "@/lib/elevenlabs/prompt-sections";
import { toLanguageCode } from "@/lib/elevenlabs/prompt";

type KnowledgeBaseLocator = {
  type: string;
  name: string;
  id: string;
  usageMode?: string;
};

type SystemToolConfigInput = {
  type?: "system";
  name: string;
  description?: string;
  params: {
    systemToolType: string;
    [key: string]: unknown;
  };
};

type BuiltInToolsInput = {
  voicemailDetection?: SystemToolConfigInput;
  transferToNumber?: SystemToolConfigInput;
  endCall?: SystemToolConfigInput;
  [key: string]: unknown;
};

/** UI language options — only German variants (ElevenLabs agent code: de). */
export const AGENT_LANGUAGE_OPTIONS = [
  { value: "Deutsch", label: "Deutsch" },
  { value: "Schweizerdeutsch", label: "Schweizerdeutsch" },
] as const;

export type AgentLanguageLabel = (typeof AGENT_LANGUAGE_OPTIONS)[number]["value"];

/** Default TTS model for all ElevenLabs Conversational AI agents. */
export const ELEVENLABS_TTS_MODEL = "eleven_flash_v2_5";

/**
 * Default LLM for **voice/phone** agents on ElevenLabs only.
 * Written channels (E-Mail, WhatsApp, Chat) use OpenAI via ENRICHMENT_API_KEY — see lib/text-assistant/.
 */
export const ELEVENLABS_LLM_MODEL = "gemini-2.5-flash";

export const ELEVENLABS_PROMPT_TEMPERATURE = 0.3;
/** Ceiling per turn — high enough that normal spoken sentences never truncate mid-word. */
export const ELEVENLABS_PROMPT_MAX_TOKENS = 400;
/** Phone/voice agents with appointment tools need room for tool calls + confirmation. */
export const ELEVENLABS_APPOINTMENT_MAX_TOKENS = 1024;
/** Chat test needs room for tool calls + booking confirmation. */
export const ELEVENLABS_CHAT_MAX_TOKENS = 1024;
export const ELEVENLABS_TURN_TIMEOUT_SECONDS = 8;
export const ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS = 45;
/** Allow multi-minute conversations (was 300 = 5 min, which cut long calls short). */
export const ELEVENLABS_MAX_DURATION_SECONDS = 1800;
/** Anchors the agent to the correct current date/year (LLMs otherwise guess a stale year). */
export const ELEVENLABS_AGENT_TIMEZONE = "Europe/Zurich";

const CONVERSATION_CONTEXT_BLOCK = `# Kontext
- Aktuelles Datum und Uhrzeit (Europe/Zurich): {{system__time}}.
- Leite das laufende Jahr **immer** aus diesem Datum ab — nenne von dir aus nie ein anderes Jahr.
- Ein vom Anrufer genanntes Datum (z. B. «23. Juni») meint die **nächste passende Zukunft**. Behandle es nur dann als vergangen, wenn es eindeutig vor dem heutigen Datum liegt.
- «heute», «morgen», «übermorgen», «nächste Woche Montag» usw. auf Basis des heutigen Datums in ein konkretes Kalenderdatum (YYYY-MM-DD) umrechnen.`;

const BREVITY_INSTRUCTION_BLOCK = `# Antwortstil (Telefon)
- Sprich natürlich und **beende jeden Satz vollständig** — brich niemals mitten im Satz oder Wort ab.
- Fasse dich pro Turn kurz: in der Regel 1–2 vollständige Sätze. Stelle immer nur **eine** Rückfrage auf einmal.
- Werde **nie kommentarlos still**: Wenn du auf ein Tool-Ergebnis wartest oder nachdenkst, sag vorher einen kurzen Überbrückungssatz.
- Vor einer Verfügbarkeitsprüfung **genau einen kurzen Überbrückungssatz** sagen (z. B. «Einen Moment, ich prüfe das kurz für Sie»), dann check_availability aufrufen — die Prüfung kann ein paar Sekunden dauern.
- Terminbuchung: Datum und Uhrzeit klären, einmal als konkretes Kalenderdatum bestätigen, dann Slot prüfen und buchen.
- **Nicht** nach Vorname, Telefonnummer oder Dauer fragen — Nachname, Datum und Uhrzeit genügen.
- Relative Datumsangaben («Montag nächste Woche», «übermorgen») verstehen und in ein konkretes Datum umrechnen — bei Unklarheit **einmal** mit dem konkreten Kalenderdatum nachfragen.
- Verstehe Zustimmungen flexibel: ja, passt, gerne, super, machen wir, klingt gut, jo, passt scho.
- **VERBOT:** Nie «eingetragen» oder «bestätigt» sagen, bevor book_appointment **booked:true** antwortete (das Buchen selbst aber nicht ankündigen).
- available=true → **ohne Ankündigung** book_appointment aufrufen, dann **ein vollständiger Satz** mit Dank + Datum/Uhrzeit, dann **sofort** end_call.
- Bei einem Problem mit der Prüfung: einmal wiederholen, sonst freundlich einen Rückruf anbieten — nicht einfach verstummen.
- Nach booked:true oder erfolgreicher Stornierung: ein vollständiger Dank-Satz mit Datum/Uhrzeit, dann **Pflicht** end_call — kein weiteres Gespräch.`;

export const CHAT_INSTRUCTION_BLOCK = `# Antwortstil (Chat-Test)
- Schreibe vollständige Antworten — brich niemals mitten im Satz ab.
- Bei Terminanfragen: check_availability ZUERST aufrufen, DANN das Ergebnis mitteilen.
- Sage NIEMALS «ich prüfe» oder «einen Moment» bevor check_availability aufgerufen wurde.
- Wenn Name, Datum und Uhrzeit bereits genannt wurden: sofort check_availability aufrufen, keine Rückfragen.
- durationMinutes aus Kundenangabe übernehmen (z. B. 30 für «30 Minuten»).
- Einen Termin als «eingetragen» bezeichnen ist nur erlaubt, wenn book_appointment mit booked: true antwortete.
- Dauer aus Kundenangabe (z. B. «30 Minuten») als durationMinutes übergeben.
- Bei bookingError=true: book_appointment sofort erneut mit denselben Parametern — nicht weiterleiten.
- Nach **klarer Kundenzustimmung** (ja, passt, gerne, super, machen wir, klingt gut, …): book_appointment mit attendeeName, appointmentDate, appointmentTime, appointmentTypeId.
- **VERBOT:** Nie «eingetragen» oder «verbindlich» sagen, bevor book_appointment booked:true lieferte.
- Nach booked:true: ein kurzer Bestätigungssatz, dann Gespräch beenden — keine weiteren Fragen.`;

export function buildTtsConfig(voiceId: string) {
  return {
    voiceId,
    modelId: ELEVENLABS_TTS_MODEL,
  };
}

export function buildVoicemailDetectionTool(): SystemToolConfigInput {
  return {
    type: "system",
    name: "voicemail_detection",
    params: {
      systemToolType: "voicemail_detection",
    },
  };
}

export function buildEndCallTool(): SystemToolConfigInput {
  return {
    type: "system",
    name: "end_call",
    description:
      "Pflicht nach booked:true oder erfolgreicher Stornierung: sofort nach einem kurzen Danke-Satz aufrufen und das Gespräch beenden.",
    params: {
      systemToolType: "end_call",
    },
  };
}

export function buildTransferToNumberTool(
  phoneNumber: string
): SystemToolConfigInput {
  return {
    type: "system",
    name: "transfer_to_number",
    description:
      "Verbindet den Anruf mit einer echten Person im Praxisteam bei Beschwerden oder medizinischen Fragen.",
    params: {
      systemToolType: "transfer_to_number",
      transfers: [
        {
          transferDestination: {
            type: "phone",
            phoneNumber,
          },
          condition:
            "Anrufer hat Beschwerden, Symptome, Schmerzen, einen Notfall, eine medizinische Frage oder möchte mit einer echten Person sprechen.",
        },
      ],
    },
  };
}

export function buildBuiltInToolsDefaults(
  existing?: BuiltInToolsInput | null,
  options?: { endCall?: boolean }
): BuiltInToolsInput {
  return {
    ...existing,
    voicemailDetection:
      existing?.voicemailDetection ?? buildVoicemailDetectionTool(),
    ...(options?.endCall
      ? { endCall: existing?.endCall ?? buildEndCallTool() }
      : {}),
  };
}

export function buildTurnDefaults(timeoutSeconds = ELEVENLABS_TURN_TIMEOUT_SECONDS) {
  return {
    turnTimeout: timeoutSeconds,
  };
}

export function buildConversationDefaults() {
  return {
    maxDurationSeconds: ELEVENLABS_MAX_DURATION_SECONDS,
  };
}

export function normalizeKnowledgeBase(value: unknown): KnowledgeBaseLocator[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is KnowledgeBaseLocator =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as KnowledgeBaseLocator).id === "string" &&
          typeof (item as KnowledgeBaseLocator).name === "string" &&
          typeof (item as KnowledgeBaseLocator).type === "string"
      )
  );
}

export function buildAgentPromptDefaults(
  systemPrompt: string,
  options?: {
    knowledgeBase?: KnowledgeBaseLocator[] | unknown;
    builtInTools?: BuiltInToolsInput | null;
    maxTokens?: number;
    toolIds?: string[];
  }
) {
  return {
    prompt: systemPrompt,
    llm: ELEVENLABS_LLM_MODEL,
    temperature: ELEVENLABS_PROMPT_TEMPERATURE,
    maxTokens: options?.maxTokens ?? ELEVENLABS_PROMPT_MAX_TOKENS,
    timezone: ELEVENLABS_AGENT_TIMEZONE,
    knowledgeBase: normalizeKnowledgeBase(options?.knowledgeBase),
    builtInTools: buildBuiltInToolsDefaults(options?.builtInTools),
    ...(options?.toolIds ? { toolIds: options.toolIds } : {}),
  };
}

export function ensureBrevityInstruction(systemPrompt: string): string {
  const trimmed = systemPrompt.trim();
  if (/# Antwortstil \(Telefon\)/i.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${CONVERSATION_CONTEXT_BLOCK}\n\n${BREVITY_INSTRUCTION_BLOCK}`;
}

/** Chat test: no phone brevity cap, explicit booking completion rules. */
export function prepareAgentChatSystemPrompt(
  rawPrompt: string,
  language: AgentLanguageLabel
): string {
  const sections = parseSystemPrompt(rawPrompt);
  const behaviorPrompt = composeBehaviorSystemPrompt(sections);
  const base = behaviorPrompt.trim() || rawPrompt.trim();
  return applyLanguageInstructions(
    `${base}\n\n${CONVERSATION_CONTEXT_BLOCK}\n\n${CHAT_INSTRUCTION_BLOCK}`,
    language
  );
}

/** Slim prompt for ElevenLabs: behavior only + brevity (FAQ sections stay out of prompt tokens). */
export function prepareAgentSystemPrompt(
  rawPrompt: string,
  language: AgentLanguageLabel
): string {
  const sections = parseSystemPrompt(rawPrompt);
  const behaviorPrompt = composeBehaviorSystemPrompt(sections);
  const base = behaviorPrompt.trim() || rawPrompt.trim();
  return applyLanguageInstructions(ensureBrevityInstruction(base), language);
}

export function isAllowedAgentLanguage(
  language: string
): language is AgentLanguageLabel {
  return AGENT_LANGUAGE_OPTIONS.some((o) => o.value === language);
}

export function normalizeAgentLanguage(language?: string): AgentLanguageLabel {
  if (language && isAllowedAgentLanguage(language)) return language;
  return "Deutsch";
}

/** Appends spoken-language rules to the system prompt. */
export function applyLanguageInstructions(
  systemPrompt: string,
  language: AgentLanguageLabel
): string {
  const block =
    language === "Schweizerdeutsch"
      ? `\n\n# Sprache\n- Antworte durchgehend auf Schweizerdeutsch (alltagsnah, z. B. Zürich/Bern).\n- Verwende typische Formulierungen wie «Grüezi», «Merci vilmal», «En Guete».\n- Hochdeutsch nur, wenn der Anrufer ausdrücklich danach fragt.`
      : `\n\n# Sprache\n- Antworte durchgehend auf Hochdeutsch, klar und verständlich.`;

  return systemPrompt.trim() + block;
}

export function buildConversationConfig(params: {
  greeting: string;
  language: string;
  systemPrompt: string;
  voiceId: string;
  knowledgeBase?: KnowledgeBaseLocator[] | unknown;
  builtInTools?: BuiltInToolsInput | null;
  maxTokens?: number;
  turnTimeoutSeconds?: number;
  chatMode?: boolean;
  toolIds?: string[];
}) {
  const language = normalizeAgentLanguage(params.language);
  const preparedPrompt = params.chatMode
    ? prepareAgentChatSystemPrompt(params.systemPrompt, language)
    : prepareAgentSystemPrompt(params.systemPrompt, language);

  return {
    agent: {
      firstMessage: params.greeting,
      language: toLanguageCode(language),
      prompt: buildAgentPromptDefaults(preparedPrompt, {
        knowledgeBase: params.knowledgeBase,
        builtInTools: params.builtInTools,
        maxTokens: params.maxTokens,
        toolIds: params.toolIds,
      }),
    },
    tts: buildTtsConfig(params.voiceId),
    turn: buildTurnDefaults(params.turnTimeoutSeconds),
    conversation: buildConversationDefaults(),
  };
}

/** REST API snake_case patch for migration scripts (PATCH /v1/convai/agents/{id}). */
export function buildConversationConfigCostPatchSnake(options: {
  prompt?: string;
  firstMessage?: string;
  knowledgeBase?: KnowledgeBaseLocator[] | unknown;
  builtInTools?: Record<string, unknown>;
}) {
  return {
    conversation_config: {
      tts: { model_id: ELEVENLABS_TTS_MODEL },
      turn: { turn_timeout: ELEVENLABS_TURN_TIMEOUT_SECONDS },
      conversation: { max_duration_seconds: ELEVENLABS_MAX_DURATION_SECONDS },
      agent: {
        ...(options.firstMessage ? { first_message: options.firstMessage } : {}),
        prompt: {
          ...(options.prompt ? { prompt: options.prompt } : {}),
          llm: ELEVENLABS_LLM_MODEL,
          temperature: ELEVENLABS_PROMPT_TEMPERATURE,
          max_tokens: ELEVENLABS_PROMPT_MAX_TOKENS,
          timezone: ELEVENLABS_AGENT_TIMEZONE,
          knowledge_base: normalizeKnowledgeBase(options.knowledgeBase),
          built_in_tools: {
            ...options.builtInTools,
            voicemail_detection: {
              type: "system",
              name: "voicemail_detection",
              params: { system_tool_type: "voicemail_detection" },
            },
          },
        },
      },
    },
  };
}

export interface RawElevenLabsVoice {
  voiceId?: string;
  name?: string;
  labels?: Record<string, string>;
  verifiedLanguages?: {
    language?: string;
    locale?: string;
    accent?: string;
    modelId?: string;
  }[];
}

import {
  normalizeVoiceGender,
  suggestAssistantName,
  type AssistantVoiceGender,
} from "@/lib/elevenlabs/assistant-names";

export interface AgentVoiceOption {
  id: string;
  /** ElevenLabs voice label (internal). */
  name: string;
  /** Altdeutscher Anzeigename passend zum Stimmgeschlecht. */
  displayName: string;
  gender: AssistantVoiceGender;
  language: string;
  swissGerman: boolean;
}

function voiceHaystack(v: RawElevenLabsVoice): string {
  const verified = (v.verifiedLanguages ?? [])
    .map((x) => `${x.language} ${x.locale} ${x.accent}`)
    .join(" ");
  return `${v.name ?? ""} ${Object.values(v.labels ?? {}).join(" ")} ${verified}`.toLowerCase();
}

/** True when ElevenLabs verified metadata includes German. */
export function voiceSupportsGerman(v: RawElevenLabsVoice): boolean {
  const verified = v.verifiedLanguages ?? [];
  if (verified.length > 0) {
    return verified.some(
      (vl) =>
        vl.language === "de" ||
        vl.locale?.toLowerCase().startsWith("de") ||
        /german|deutsch|schweiz|swiss/i.test(vl.accent ?? "")
    );
  }
  return /(german|deutsch|\bde\b|schweiz|swiss)/.test(voiceHaystack(v));
}

export function voiceIsSwissGerman(v: RawElevenLabsVoice): boolean {
  const verified = v.verifiedLanguages ?? [];
  if (
    verified.some(
      (vl) =>
        vl.locale?.toLowerCase() === "de-ch" ||
        /swiss|schweiz|zürich|zurich|bern|basel/i.test(vl.accent ?? "")
    )
  ) {
    return true;
  }
  return /(schweiz|swiss|zürich|zurich|bern|basel|grüezi)/i.test(voiceHaystack(v));
}

export function voiceDisplayLanguage(v: RawElevenLabsVoice): string {
  if (voiceIsSwissGerman(v)) return "Schweizerdeutsch";
  if (voiceSupportsGerman(v)) return "Deutsch";
  return "Deutsch";
}

/** Voices suitable for German phone agents (excludes e.g. English-only Daniel). */
export function filterAgentVoices(
  voices: RawElevenLabsVoice[]
): AgentVoiceOption[] {
  const eligible = voices.filter(
    (v) => v.voiceId && v.name && voiceSupportsGerman(v)
  );

  let femaleIndex = 0;
  let maleIndex = 0;

  const mapped = eligible.map((v) => {
    const gender = normalizeVoiceGender(v.labels?.gender);
    const index = gender === "male" ? maleIndex++ : femaleIndex++;
    return {
      id: v.voiceId as string,
      name: v.name as string,
      displayName: suggestAssistantName(gender, index),
      gender,
      language: voiceDisplayLanguage(v),
      swissGerman: voiceIsSwissGerman(v),
    };
  });

  return mapped.sort((a, b) => {
    const score = (x: AgentVoiceOption) =>
      (x.swissGerman ? 2 : 0) + (x.language === "Deutsch" ? 1 : 0);
    const diff = score(b) - score(a);
    return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName, "de");
  });
}

export function pickDefaultAgentVoice(
  voices: AgentVoiceOption[]
): AgentVoiceOption | undefined {
  return (
    voices.find((v) => v.swissGerman) ??
    voices.find((v) => v.language === "Deutsch") ??
    voices[0]
  );
}
