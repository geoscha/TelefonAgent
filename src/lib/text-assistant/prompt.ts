import "server-only";

import { CHAT_INSTRUCTION_BLOCK } from "@/lib/elevenlabs/agent-config";
import { buildLiveAgentSystemPrompt } from "@/lib/elevenlabs/agent-sync";
import type { StoredAgent } from "@/lib/onboarding-types";

export type TextChannelKind = "chat" | "email" | "whatsapp" | "sms";

const TEXT_CHANNEL_BLOCK = `# Kanal (schriftlich)
- Du antwortest per **E-Mail, WhatsApp oder Chat** — nicht am Telefon.
- Schreibe vollständige, klare Sätze. Keine abgebrochenen Antworten.
- Verwende bei E-Mails eine kurze Anrede und einen höflichen Abschluss.
- Bei WhatsApp darfst du etwas knapper formulieren, aber immer professionell (Sie-Form).
- Du hast dieselben Informationen, Termin-Tools und Regeln wie der Telefon-Assistent.`;

export function buildTextAssistantSystemPrompt(
  agent: StoredAgent,
  channel?: TextChannelKind
): string {
  const channelNote =
    channel === "email"
      ? "\n- Aktueller Kanal: **E-Mail**."
      : channel === "whatsapp"
        ? "\n- Aktueller Kanal: **WhatsApp**."
        : channel === "sms"
          ? "\n- Aktueller Kanal: **SMS**."
          : "";

  return [
    buildLiveAgentSystemPrompt(agent),
    TEXT_CHANNEL_BLOCK + channelNote,
    CHAT_INSTRUCTION_BLOCK,
  ].join("\n\n");
}
