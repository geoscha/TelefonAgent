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
import {
  formatBusinessHoursForPrompt,
  normalizeBusinessHours,
} from "@/lib/integrations/business-hours";
import type { StoredAgent } from "@/lib/onboarding-types";

/**
 * Instructions appended to the agent prompt when appointment booking is enabled.
 * The agent calls the registered server tools (webhook → /api/agent-tools/appointment).
 */
export function buildAppointmentBlock(
  config?: AppointmentConfig,
  agent?: Pick<StoredAgent, "businessHours">
): string {
  const hoursBlock = formatBusinessHoursForPrompt(
    normalizeBusinessHours(agent?.businessHours)
  );
  return buildAppointmentPrompt(config, hoursBlock);
}

/**
 * Default behavioral system prompt for property-management phone agents.
 * Factual FAQ / opening hours belong in the ElevenLabs knowledge base, not here.
 */
export function buildSystemPrompt(agentName: string): string {
  return `Du bist «${agentName}», die freundliche Telefonassistenz eines kleinen Unternehmens in der Schweiz.

# Rolle und Ton
- Freundlich, professionell und geduldig — Sie-Form.
- Antworte kurz. Stelle gezielte Rückfragen statt langer Erklärungen.

# Verhalten
- Nimm Anliegen von Kundinnen und Kunden entgegen.
- Bei Terminwünschen: Name erfassen, Datum und Uhrzeit klären, Verfügbarkeit prüfen.
- Beantworte einfache Fragen zu Öffnungszeiten und Leistungen — keine Fachberatung.
- Versprich keine Preise oder Leistungen, die du nicht kennst — kündige Rückruf an.

# Abschluss
- Fasse kurz zusammen, verabschiede dich freundlich.`;
}
