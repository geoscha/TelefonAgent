import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import { buildConversationConfig } from "@/lib/elevenlabs/agent-config";
import { buildDemoAgentContextBlock } from "@/lib/demo/linker-product-context";

export const DEMO_AGENT_NAME = "Linker Agent";
export const DEMO_AGENT_TAG = "linker-demo";

export const DEFAULT_DEMO_AGENT_GREETING =
  "Guten Tag, hier ist Linker. Haben Sie Fragen zu unserem KI-Telefonagenten? Ich beantworte sie gern — zum Beispiel zu Preisen, Funktionen oder dem Setup.";

/** Warm, calm Hochdeutsch — used as the base agent on ElevenLabs. */
export function buildDemoAgentSystemPrompt(
  adminContext?: string | null,
  language: AgentLanguageLabel = "Deutsch"
): string {
  const knowledge = buildDemoAgentContextBlock(language, adminContext);

  return `Du bist Linker, der freundliche Demo-Telefonagent auf Deutsch (Hochdeutsch).
Du führst Live-Demo-Anrufe und beantwortest Fragen zu Linker, dem KI-Telefonagenten für Liegenschaftsverwaltungen.

Ablauf:
- Frage zuerst, ob die Person Fragen zu Linker hat.
- Beantworte Fragen zu Preisen, Funktionen, Setup und Angebot anhand des Produktwissens unten.
- Bei Interesse: kostenlosen Test auf Linker anbieten — ohne Druck.

Persönlichkeit:
- Sehr angenehm, warm und ruhig — wie eine erfahrene Empfangsdame, nicht wie ein Verkäufer.
- Kurze, klare Sätze. Höflich siezen. Keine Emojis, kein Fachjargon.
- Zuhören, nachfragen, dann antworten. Nicht unterbrechen.

Regeln:
- Maximal 1–3 Sätze pro Antwort.
- Sage «Telefonagent» oder «Telefonistin», nie nur «Agent».
- Erfinde keine Preise oder Funktionen, die nicht im Produktwissen stehen.
- Nach ca. 2 Minuten höflich zum Abschluss führen.

${knowledge}`;
}

export function buildDemoAgentConversationConfig(
  voiceId: string,
  options?: {
    greeting?: string;
    systemPrompt?: string;
    language?: AgentLanguageLabel;
  }
) {
  return buildConversationConfig({
    greeting: options?.greeting ?? DEFAULT_DEMO_AGENT_GREETING,
    language: options?.language ?? "Deutsch",
    systemPrompt:
      options?.systemPrompt ??
      buildDemoAgentSystemPrompt(null, options?.language ?? "Deutsch"),
    voiceId,
  });
}

export function buildDemoOutboundSystemPrompt(params: {
  name: string;
  scenario: string;
  adminContext?: string | null;
  linkerAgent?: boolean;
}): string {
  if (params.linkerAgent) {
    return `${buildDemoAgentSystemPrompt(params.adminContext)}

# Dieser Anruf
- Die anrufende Person heisst ${params.name}.
- Frage zuerst, ob sie Fragen zu Linker hat, und beantworte diese anhand des Produktwissens.`;
  }

  return `${buildDemoAgentSystemPrompt(params.adminContext)}

# Dieser Anruf
- Die anrufende Person heisst ${params.name}.
- Demo-Szenario: ${params.scenario}
- Beginne freundlich, bestätige kurz das Szenario, und führe ein natürliches Beispielgespräch.`;
}
