import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import {
  CALL_MINUTE_COST_TOKENS,
  formatCallMinuteCostLabel,
  formatPhoneNumberCostLabel,
  formatTokenCount,
} from "@/lib/billing/quota-display";

/** Shared product facts for demo / sales agents (client-safe). */
export function buildCuraProductKnowledgeBlock(
  language: AgentLanguageLabel = "Deutsch"
): string {
  const callRate = formatCallMinuteCostLabel();
  const phoneRate = formatPhoneNumberCostLabel();

  if (language === "Schweizerdeutsch") {
    return `# Cura — Produktwissen
Cura isch en KI-Telefonagänt für Liegenschaftsverwaltige in de Schwiiz.
Er nimmt Ahruuf 24/7 a (Schäde, Mietfrage, Termin, Empfang), transkribiert Gspröch und fasst sie zämm.
Setup: Agent aalege, Telefonnummere beantrage oder SIP verbinde, Nummere wiiterleite.

# Preise (Tokens)
- Guthabe wird in Tokens ufeglade (Pakete unter Abrechnung, ab CHF 0.50).
- Gspröchsziit: ${formatTokenCount(CALL_MINUTE_COST_TOKENS)} Tokens/Min. (${callRate})
- Telefonnummere: ${phoneRate}
- Pay as you Go: unlimitiert mit hinterlegter Charte — Tokens werded automatisch abgliche.

# Funktione
- Eigene Begrüssig, Stimm und Aawisige pro Agent
- Ahruuf-Transkript und Zämmefassig in de App
- Kalender-Integration (Google, Outlook, Apple) für Terminbuechig
- Mehreri Agente und Nummere pro Konto`;
  }

  return `# Cura — Produktwissen
Cura ist ein KI-Telefonagent für Liegenschaftsverwaltungen in der Schweiz.
Er nimmt Anrufe 24/7 entgegen (Schäden, Miete, Termine, Empfang), transkribiert Gespräche und fasst sie zusammen.
Setup: Agent anlegen, Telefonnummer beantragen oder SIP verbinden, Nummer weiterleiten.

# Preise (Tokens)
- Guthaben wird in Tokens aufgeladen (Pakete unter Abrechnung, ab CHF 0.50).
- Gesprächszeit: ${formatTokenCount(CALL_MINUTE_COST_TOKENS)} Tokens/Min. (${callRate})
- Telefonnummer: ${phoneRate}
- Pay as you Go: unbegrenzt mit hinterlegter Karte — Tokens werden automatisch abgebucht.

# Funktionen
- Eigene Begrüssung, Stimme und Anweisungen pro Agent
- Anruf-Transkripte und Zusammenfassungen in der App
- Kalender-Integration (Google, Outlook, Apple) für Terminbuchung
- Mehrere Agenten und Nummern pro Konto`;
}

export function buildDemoAgentContextBlock(
  language: AgentLanguageLabel = "Deutsch",
  adminContext?: string | null
): string {
  const base = buildCuraProductKnowledgeBlock(language);
  const extra = adminContext?.trim();
  if (!extra) return base;
  return `${base}\n\n# Zusätzlicher Kontext (Admin)\n${extra}`;
}
