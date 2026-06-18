import { toLanguageCode } from "@/lib/elevenlabs/prompt";

/** UI language options — only German variants (ElevenLabs agent code: de). */
export const AGENT_LANGUAGE_OPTIONS = [
  { value: "Deutsch", label: "Deutsch" },
  { value: "Schweizerdeutsch", label: "Schweizerdeutsch" },
] as const;

export type AgentLanguageLabel = (typeof AGENT_LANGUAGE_OPTIONS)[number]["value"];

export const MULTILINGUAL_TTS_MODEL = "eleven_flash_v2_5";

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
}) {
  const language = normalizeAgentLanguage(params.language);
  return {
    agent: {
      firstMessage: params.greeting,
      language: toLanguageCode(language),
      prompt: {
        prompt: applyLanguageInstructions(params.systemPrompt, language),
      },
    },
    tts: {
      voiceId: params.voiceId,
      modelId: MULTILINGUAL_TTS_MODEL,
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
