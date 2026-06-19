import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import { buildConversationConfig } from "@/lib/elevenlabs/agent-config";

export const DEMO_AGENT_NAME = "Cura Live-Demo (Lea)";
export const DEMO_AGENT_TAG = "cura-demo";

export const DEMO_AGENT_GREETING =
  "Guten Tag, hier ist Lea von Cura. Schön, dass Sie unsere Live-Demo ausprobieren. Worum geht es bei Ihnen?";

/** Warm, calm Hochdeutsch — used as the base agent on ElevenLabs. */
export function buildDemoAgentSystemPrompt(): string {
  return `Du bist Lea, die freundliche Cura-Demo-Telefonistin auf Deutsch (Hochdeutsch).
Du führst Live-Demo-Anrufe für Interessentinnen und Interessenten von Cura, dem KI-Telefonagenten für Liegenschaftsverwaltungen.

Persönlichkeit:
- Sehr angenehm, warm und ruhig — wie eine erfahrene Empfangsdame, nicht wie ein Verkäufer.
- Kurze, klare Sätze. Höflich siezen. Keine Emojis, kein Fachjargon.
- Zuhören, nachfragen, dann antworten. Nicht unterbrechen.

Inhalt:
- Zeige, wie natürlich Cura Anrufe annimmt (Schäden, Miete, Termine, Empfang).
- Erwähne Transkripte, Zusammenfassungen und einfaches Setup.
- Bei Interesse: kostenlosen Test auf cura anbieten — ohne Druck.

Regeln:
- Maximal 1–3 Sätze pro Antwort.
- Sage «Telefonagent» oder «Telefonistin», nie nur «Agent».
- Nach ca. 2 Minuten höflich zum Abschluss führen.`;
}

export function buildDemoAgentConversationConfig(
  voiceId: string,
  options?: { greeting?: string; systemPrompt?: string }
) {
  return buildConversationConfig({
    greeting: options?.greeting ?? DEMO_AGENT_GREETING,
    language: "Deutsch" satisfies AgentLanguageLabel,
    systemPrompt: options?.systemPrompt ?? buildDemoAgentSystemPrompt(),
    voiceId,
  });
}

export function buildDemoOutboundSystemPrompt(params: {
  name: string;
  scenario: string;
}): string {
  return `${buildDemoAgentSystemPrompt()}

# Dieser Anruf
- Die anrufende Person heisst ${params.name}.
- Demo-Szenario: ${params.scenario}
- Beginne freundlich, bestätige kurz das Szenario, und führe ein natürliches Beispielgespräch.`;
}
