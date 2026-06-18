import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";

/** Primary: fast + reliable German via language_code. */
export const DEMO_TTS_MODEL = "eleven_flash_v2_5";

/** Fallback when flash rejects the request (quota, voice, etc.). */
export const DEMO_TTS_MODEL_FALLBACK = "eleven_multilingual_v2";

const AGENT_REPLACEMENTS: [RegExp, string][] = [
  [/\bAgents\b/g, "Telefonagenten"],
  [/\bAgenten\b/g, "Telefonagenten"],
  [/\bAgentin\b/g, "Telefonagentin"],
  [/\bAgent\b/g, "Telefonagent"],
  [/\bKI-Telefonagent/g, "K I Telefonagent"],
  [/\bKI-/g, "K I "],
];

/** Swiss TTS spellings that steer accent away from English loanwords. */
const SWISS_SPEAK_REPLACEMENTS: [RegExp, string][] = [
  [/\bTelefonagenten\b/g, "Telefonagänt"],
  [/\bTelefonagent\b/g, "Telefonagänt"],
];

/**
 * Normalises demo copy before ElevenLabs so English voices don't read
 * «Agent» as «Eischent» and German stays clearly articulated.
 */
export function prepareDemoTtsText(
  text: string,
  language: AgentLanguageLabel
): string {
  let out = text;
  for (const [pattern, replacement] of AGENT_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  if (language === "Schweizerdeutsch") {
    for (const [pattern, replacement] of SWISS_SPEAK_REPLACEMENTS) {
      out = out.replace(pattern, replacement);
    }
  }

  return out;
}

export const DEMO_TTS_VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.82,
} as const;

export type DemoTtsAttempt = {
  model_id: string;
  language_code?: string;
};

export const DEMO_TTS_ATTEMPTS: DemoTtsAttempt[] = [
  { model_id: DEMO_TTS_MODEL, language_code: "de" },
  { model_id: DEMO_TTS_MODEL_FALLBACK },
];
