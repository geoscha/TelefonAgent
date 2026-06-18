import type { ElevenLabsSettings } from "@/lib/store";

/** Detects the old Boris / Ćevapi wholesaler demo — not normal «Curatz Telefonassistenz». */
export function isLegacyAgentConfig(settings: ElevenLabsSettings): boolean {
  const hay = [
    settings.greeting,
    settings.systemPrompt,
    settings.agentName,
  ]
    .filter(Boolean)
    .join(" ");
  return /boris|ćevapi|cevapi|grosshandelspartner|virtuelle assistent der curatz ag|grosshändler für/i.test(
    hay
  );
}

export function defaultAgentName(profileName: string): string {
  const first = profileName.trim().split(/\s+/)[0];
  return first ? `${first}s Telefonagent` : "Cura Telefonagent";
}

export function defaultGreeting(agentName: string): string {
  const short = agentName.replace(/s Telefonagent$/, "").trim() || "Cura";
  return `Guten Tag, Sie erreichen die Liegenschaftsverwaltung. Mein Name ist ${short}. Wie kann ich Ihnen helfen?`;
}
