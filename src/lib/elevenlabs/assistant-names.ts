export type AssistantVoiceGender = "male" | "female";

const FEMALE_NAMES = [
  "Greta",
  "Helena",
  "Klara",
  "Lina",
  "Marta",
  "Nora",
  "Rosa",
  "Thea",
  "Elise",
  "Hedwig",
  "Johanna",
  "Mathilde",
] as const;

const MALE_NAMES = [
  "Friedrich",
  "Heinrich",
  "Johann",
  "Konrad",
  "Ludwig",
  "Otto",
  "Rudolf",
  "Werner",
  "Albrecht",
  "Emil",
  "Ferdinand",
  "Wilhelm",
] as const;

const ALL_SUGGESTED_NAMES = new Set<string>([
  ...FEMALE_NAMES,
  ...MALE_NAMES,
]);

export function normalizeVoiceGender(label?: string | null): AssistantVoiceGender {
  return label?.toLowerCase() === "male" ? "male" : "female";
}

export function suggestAssistantName(
  gender: AssistantVoiceGender,
  index = 0
): string {
  const pool = gender === "male" ? MALE_NAMES : FEMALE_NAMES;
  return pool[Math.abs(index) % pool.length] ?? pool[0];
}

export function isAutoSuggestedName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && ALL_SUGGESTED_NAMES.has(trimmed);
}

export function greetingForAssistantName(
  assistantName: string,
  language: "Deutsch" | "Schweizerdeutsch",
  branchLabel?: string
): string {
  const firstName = assistantName.trim().split(/\s+/)[0] || assistantName.trim();
  if (language === "Schweizerdeutsch") {
    return branchLabel
      ? `Grüezi, da isch ${firstName} vo ${branchLabel}. Wie cha ich Ihne hälfe?`
      : `Grüezi, da isch ${firstName}. Wie cha ich Ihne hälfe?`;
  }
  return branchLabel
    ? `Guten Tag, Sie sprechen mit ${firstName} von ${branchLabel}. Wie kann ich Ihnen helfen?`
    : `Guten Tag, Sie sprechen mit ${firstName}. Wie kann ich Ihnen helfen?`;
}

export function shouldAutoRenameAssistant(
  currentName: string,
  previousDisplayName?: string
): boolean {
  const trimmed = currentName.trim();
  if (!trimmed) return true;
  if (previousDisplayName && trimmed === previousDisplayName.trim()) return true;
  return isAutoSuggestedName(trimmed);
}
