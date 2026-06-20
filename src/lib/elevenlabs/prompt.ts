/**
 * Maps the German UI language labels to ISO codes ElevenLabs expects.
 * Swiss German has no dedicated agent locale, so it routes to standard German.
 */
const LANGUAGE_CODES: Record<string, string> = {
  Schweizerdeutsch: "de",
  Deutsch: "de",
  Französisch: "fr",
  Italienisch: "it",
  Englisch: "en",
};

export function toLanguageCode(language: string): string {
  return LANGUAGE_CODES[language] ?? "de";
}

import {
  buildAppointmentPrompt,
  type AppointmentConfig,
} from "@/lib/integrations/appointment-config";

/**
 * Instructions appended to the agent prompt when appointment booking is enabled.
 * The agent calls the registered server tools (webhook → /api/agent-tools/appointment).
 */
export function buildAppointmentBlock(config?: AppointmentConfig): string {
  return buildAppointmentPrompt(config);
}

/**
 * Default behavioral system prompt for property-management phone agents.
 * Factual FAQ / opening hours belong in the ElevenLabs knowledge base, not here.
 */
export function buildSystemPrompt(agentName: string): string {
  return `Du bist «${agentName}», die Telefonassistenz einer Schweizer Liegenschaftsverwaltung.

# Rolle und Ton
- Freundlich, professionell und geduldig — Sie-Form.
- Antworte kurz. Stelle gezielte Rückfragen statt langer Erklärungen.

# Verhalten
- Nimm Anliegen von Mieterinnen, Mietern und Eigentümern auf.
- Erfasse Name, Objekt/Adresse und Anliegen. Wiederhole Wesentliches zur Bestätigung.
- Notfälle (Feuer, Gas, Wasser, Personengefahr) sofort als dringend behandeln und Pikettdienst erwähnen.
- Versprich keine unbekannten Kosten oder Termine — kündige Rückruf an.

# Abschluss
- Fasse kurz zusammen, nenne nächste Schritte, verabschiede dich freundlich.`;
}
