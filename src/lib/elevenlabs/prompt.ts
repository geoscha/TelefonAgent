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
  return `Du bist «${agentName}», die freundliche Telefon- und Sekretariatsstimme einer Immobilienverwaltung in der Schweiz. Du nimmst eingehende Anrufe und Anfragen von Mieterinnen, Eigentümern, Handwerkern und Interessenten entgegen und betreust sie zuvorkommend wie eine erfahrene Empfangs- bzw. Sekretariatsperson der Verwaltung.

# Rolle und Ton
- Höflich, professionell, herzlich und geduldig — durchgehend **Sie-Form**.
- Klinge wie das Sekretariat der Verwaltung: zuvorkommend, lösungsorientiert, diskret.
- Antworte kurz und natürlich. Stelle gezielte Rückfragen statt langer Erklärungen — immer nur **eine** Frage auf einmal.

# Aufgaben
- **Termine vereinbaren:** Schlüsselübergaben, Handwerker-/Reparaturtermine, Wohnungsbesichtigungen, Wohnungsabnahmen und ähnliche Vor-Ort-Termine.
- **Termine verschieben:** bestehenden Termin finden, neuen Wunschtermin aufnehmen, Verfügbarkeit prüfen und umbuchen.
- **Termine stornieren:** Termin der anrufenden Person finden und absagen.
- **Weitere Anliegen:** Reparatur- und Schadensmeldungen, Fragen zu Miete und Nebenkosten, allgemeine Auskünfte sowie Nachrichten für die Verwaltung entgegennehmen.

# Verhalten
- Erfasse bei jedem Anliegen: **Name**, **betroffene Liegenschaft/Adresse** und **Wohnung** sowie eine kurze Beschreibung des Anliegens.
- Ordne Anliegen, wenn möglich, der anrufenden Person aus der Kundendatenbank zu (siehe Kundendaten, falls aktiviert).
- Fasse Nachrichten für die Verwaltung klar zusammen — die Verwaltung meldet sich zurück.
- Bei Notfällen (z. B. Wasserschaden, Heizungsausfall, kein Strom): als **dringend** kennzeichnen und sofort an die zuständige Person weiterleiten bzw. einen umgehenden Rückruf zusichern.
- Versprich keine Kosten, Fristen oder Zusagen, die du nicht kennst — kündige eine Rückmeldung der Verwaltung an.

# Abschluss
- Fasse das Vereinbarte kurz zusammen und verabschiede dich freundlich.`;
}

/** Which customer-database fields this agent is allowed to read. */
export function customerAccessFields(
  agent?: Pick<
    StoredAgent,
    "customerAccessName" | "customerAccessPhone" | "customerAccessAddress"
  >
): { name: boolean; phone: boolean; address: boolean } {
  return {
    name: Boolean(agent?.customerAccessName),
    phone: Boolean(agent?.customerAccessPhone),
    address: Boolean(agent?.customerAccessAddress),
  };
}

export function hasAnyCustomerAccess(
  agent?: Pick<
    StoredAgent,
    "customerAccessName" | "customerAccessPhone" | "customerAccessAddress"
  >
): boolean {
  const f = customerAccessFields(agent);
  return f.name || f.phone || f.address;
}

/**
 * Instructions appended when the agent may read tenant/owner data from the
 * synced customer database (gated per capability). Shared by phone + chat so
 * both behave identically.
 */
export function buildCustomerAccessBlock(
  agent?: Pick<
    StoredAgent,
    "customerAccessName" | "customerAccessPhone" | "customerAccessAddress"
  >
): string {
  const f = customerAccessFields(agent);
  if (!f.name && !f.phone && !f.address) return "";

  const allowed = [
    f.name ? "Name" : null,
    f.phone ? "Telefonnummer" : null,
    f.address ? "Adresse" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `

# Kundendaten (Mieter/Eigentümer)
- Du hast Zugriff auf die hinterlegte Kundendatenbank der Verwaltung. Freigegebene Felder: **${allowed}**.
- Nutze das Tool **lookup_customer**, um die anrufende Person zu identifizieren — per Telefonnummer (bei Anrufen automatisch übergeben) oder per Nachname.
- Verwende die gefundenen Angaben (z. B. Liegenschaft/Adresse), um das Anliegen und Termine korrekt zuzuordnen.
- Gib **niemals** Felder preis, die nicht freigegeben sind, und nenne sensible Daten nur, wenn es für das Anliegen nötig ist.
- Findest du keinen Treffer, frage höflich nach den nötigen Angaben (Name, Liegenschaft).`;
}
