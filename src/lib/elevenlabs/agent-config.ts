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
  [key: string]: unknown;
};

type WebhookToolInput = {
  type: "webhook";
  name: string;
  description: string;
  responseTimeoutSecs?: number;
  apiSchema: Record<string, unknown>;
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
 * Default LLM — gemini-2.5-flash balances cost and quality for phone agents.
 * (gemini-2.5-flash-lite is cheaper but weaker on multi-step property-management calls.)
 */
export const ELEVENLABS_LLM_MODEL = "gemini-2.5-flash";

export const ELEVENLABS_PROMPT_TEMPERATURE = 0.3;
/** ~1–2 short spoken sentences in German. */
export const ELEVENLABS_PROMPT_MAX_TOKENS = 120;
/** Chat test needs room for tool calls + booking confirmation. */
export const ELEVENLABS_CHAT_MAX_TOKENS = 500;
export const ELEVENLABS_TURN_TIMEOUT_SECONDS = 8;
export const ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS = 20;
export const ELEVENLABS_MAX_DURATION_SECONDS = 300;

const BREVITY_INSTRUCTION_BLOCK = `# Antwortstil (Telefon)
- Antworte IMMER kurz und präzise: maximal 1–2 Sätze pro Turn.
- Keine Monologe oder langen Aufzählungen am Telefon.
- Lieber eine klärende Rückfrage als eine lange Erklärung.`;

const CHAT_INSTRUCTION_BLOCK = `# Antwortstil (Chat-Test)
- Schreibe vollständige Antworten — brich niemals mitten im Satz ab.
- Bei Terminanfragen: zuerst check_availability, dann book_appointment — erst danach bestätigen.
- Leite nicht an Mitarbeitende weiter, wenn du den Termin selbst buchen kannst.
- Einen Termin als «eingetragen» bezeichnen ist nur erlaubt, wenn book_appointment erfolgreich war.`;

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
  existing?: BuiltInToolsInput | null
): BuiltInToolsInput {
  return {
    ...existing,
    voicemailDetection:
      existing?.voicemailDetection ?? buildVoicemailDetectionTool(),
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
    webhookTools?: WebhookToolInput[];
  }
) {
  return {
    prompt: systemPrompt,
    llm: ELEVENLABS_LLM_MODEL,
    temperature: ELEVENLABS_PROMPT_TEMPERATURE,
    maxTokens: options?.maxTokens ?? ELEVENLABS_PROMPT_MAX_TOKENS,
    knowledgeBase: normalizeKnowledgeBase(options?.knowledgeBase),
    builtInTools: buildBuiltInToolsDefaults(options?.builtInTools),
    ...(options?.webhookTools?.length
      ? { tools: options.webhookTools }
      : {}),
  };
}

export function ensureBrevityInstruction(systemPrompt: string): string {
  const trimmed = systemPrompt.trim();
  if (/maximal 1.?2 sätze/i.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${BREVITY_INSTRUCTION_BLOCK}`;
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
    `${base}\n\n${CHAT_INSTRUCTION_BLOCK}`,
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
  webhookTools?: WebhookToolInput[];
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
        webhookTools: params.webhookTools,
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

export interface AgentVoiceOption {
  id: string;
  name: string;
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
  return voices
    .filter((v) => v.voiceId && v.name && voiceSupportsGerman(v))
    .map((v) => ({
      id: v.voiceId as string,
      name: v.name as string,
      language: voiceDisplayLanguage(v),
      swissGerman: voiceIsSwissGerman(v),
    }))
    .sort((a, b) => {
      const score = (x: AgentVoiceOption) =>
        (x.swissGerman ? 2 : 0) + (x.language === "Deutsch" ? 1 : 0);
      const diff = score(b) - score(a);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "de");
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
