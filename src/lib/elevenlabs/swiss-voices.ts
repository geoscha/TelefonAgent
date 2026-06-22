import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import type { AssistantVoiceGender } from "@/lib/elevenlabs/assistant-names";

/**
 * Curated ElevenLabs voices for Linker phone agents (community Voice Library).
 *
 * Schweizerdeutsch (TTS): ElevenLabs has no true dialect model — these voices use
 * Swiss Standard German phonology (de-CH). Spoken Schweizerdeutsch comes from the
 * LLM system prompt; the voice supplies the Swiss accent.
 *
 * Research (2026): best-rated Swiss-capable voices in the ElevenLabs library:
 * - Female: «Heidi factual» — warm, factual, slight Swiss accent (customer service)
 * - Male: «Andi-Andres» — audiobook/professional Swiss-German accent
 * - Male alt: «Aleks» — deeper, lighter Swiss-German tint (entertainment)
 */
export const PREFERRED_SWISS_FEMALE_VOICE_IDS = [
  "kMdYHZK2wkocJnpZxE08", // Heidi factual
] as const;

export const PREFERRED_SWISS_MALE_VOICE_IDS = [
  "BfwuiKSWxqDOcSYQr6EC", // Andi-Andres
  "LNwPw7XMcJYCXyh2Bo4I", // Aleks
] as const;

/** Hochdeutsch voices — neutral German, no Swiss accent. */
export const PREFERRED_STANDARD_FEMALE_VOICE_IDS = [
  "6CS8keYmkwxkspesdyA7", // Ramona — German Customer Care
  "pMrwpTuGOma7Nubxs5jo", // Lea Brandt
] as const;

export const PREFERRED_STANDARD_MALE_VOICE_IDS = [
  "YWD7EJKbxebAtQaDZCmT", // Rick — Hochdeutsch
] as const;

const SWISS_VOICE_NAME_PATTERNS =
  /heidi\s*factual|andi[-\s]?andres|swiss[-\s]?german|schweizer(deutsch)?|made in switzerland/i;

const STANDARD_GERMAN_NAME_PATTERNS =
  /hochdeutsch|standard german|customer care|ramona|lea brandt|^rick\b/i;

export function envSwissVoiceId(
  gender: AssistantVoiceGender
): string | undefined {
  const key =
    gender === "male" ? "SWISS_VOICE_MALE_ID" : "SWISS_VOICE_FEMALE_ID";
  return process.env[key]?.trim() || undefined;
}

export function envStandardVoiceId(
  gender: AssistantVoiceGender
): string | undefined {
  const key =
    gender === "male"
      ? "STANDARD_VOICE_MALE_ID"
      : "STANDARD_VOICE_FEMALE_ID";
  return process.env[key]?.trim() || undefined;
}

export function preferredVoiceIdsForLanguage(
  language: AgentLanguageLabel,
  gender: AssistantVoiceGender
): readonly string[] {
  const env =
    language === "Schweizerdeutsch"
      ? envSwissVoiceId(gender)
      : envStandardVoiceId(gender);
  if (env) return [env];

  if (language === "Schweizerdeutsch") {
    return gender === "male"
      ? PREFERRED_SWISS_MALE_VOICE_IDS
      : PREFERRED_SWISS_FEMALE_VOICE_IDS;
  }
  return gender === "male"
    ? PREFERRED_STANDARD_MALE_VOICE_IDS
    : PREFERRED_STANDARD_FEMALE_VOICE_IDS;
}

export function voiceIdIsPreferredSwiss(voiceId: string): boolean {
  return (
    PREFERRED_SWISS_FEMALE_VOICE_IDS.includes(
      voiceId as (typeof PREFERRED_SWISS_FEMALE_VOICE_IDS)[number]
    ) ||
    PREFERRED_SWISS_MALE_VOICE_IDS.includes(
      voiceId as (typeof PREFERRED_SWISS_MALE_VOICE_IDS)[number]
    )
  );
}

export function voiceNameLooksSwiss(name: string): boolean {
  return SWISS_VOICE_NAME_PATTERNS.test(name);
}

export function voiceNameLooksStandardGerman(name: string): boolean {
  return STANDARD_GERMAN_NAME_PATTERNS.test(name);
}

/** Bonus points when ranking raw ElevenLabs voices for a language + gender. */
export function preferredVoiceScoreBonus(
  voiceId: string,
  name: string,
  language: AgentLanguageLabel,
  gender: AssistantVoiceGender
): number {
  const preferred = preferredVoiceIdsForLanguage(language, gender);
  const index = preferred.indexOf(voiceId);
  if (index >= 0) return 120 - index * 10;

  if (language === "Schweizerdeutsch" && voiceNameLooksSwiss(name)) return 40;
  if (language === "Deutsch" && voiceNameLooksStandardGerman(name)) return 25;
  if (language === "Deutsch" && voiceNameLooksSwiss(name)) return -20;
  return 0;
}
