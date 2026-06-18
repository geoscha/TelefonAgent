import {
  applyLanguageInstructions,
  type AgentLanguageLabel,
} from "@/lib/elevenlabs/agent-config";

export const DEMO_VOICE_PRESETS = [
  {
    id: "female-de",
    label: "Frau · Hochdeutsch",
    shortLabel: "Frau",
    language: "Deutsch" as AgentLanguageLabel,
    sttLocale: "de-DE",
    envKey: "DEMO_VOICE_FEMALE_DE",
  },
  {
    id: "male-ch",
    label: "Mann · Schweizerdeutsch",
    shortLabel: "Mann",
    language: "Schweizerdeutsch" as AgentLanguageLabel,
    sttLocale: "de-CH",
    envKey: "DEMO_VOICE_MALE_CH",
  },
] as const;

export type DemoVoicePresetId = (typeof DEMO_VOICE_PRESETS)[number]["id"];

export function getDemoVoicePreset(id: string) {
  return DEMO_VOICE_PRESETS.find((p) => p.id === id) ?? DEMO_VOICE_PRESETS[0];
}

export function demoLanguageInstructions(language: AgentLanguageLabel): string {
  return applyLanguageInstructions("", language).trim();
}
