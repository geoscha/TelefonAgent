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
  language: "Deutsch" | "Schweizerdeutsch"
): string {
  const firstName = assistantName.trim().split(/\s+/)[0] || assistantName.trim();
  if (language === "Schweizerdeutsch") {
    return `Grüezi, Sie haben ${firstName} erreicht.`;
  }
  return `Guten Tag, Sie haben ${firstName} erreicht.`;
}

/** Begrüssung für Privaten Assistenten — nennt den Inhaber statt den KI-Namen. */
export function greetingForPrivateAssistantOwner(
  ownerName: string,
  language: "Deutsch" | "Schweizerdeutsch"
): string {
  const owner = ownerName.trim();
  if (!owner) {
    return greetingForAssistantName("Assistent", language);
  }
  if (language === "Schweizerdeutsch") {
    return `Grüezi; Sie haben den virtuellen Assistenten von ${owner} erreicht.`;
  }
  return `Guten Tag; Sie haben den virtuellen Assistenten von ${owner} erreicht.`;
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
