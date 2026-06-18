import "server-only";

import { pickAgentVoiceId } from "@/lib/elevenlabs/pick-voice";
import {
  filterAgentVoices,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import { resolveDemoVoiceId } from "@/lib/demo/voices-server";

const PREFERRED_VOICE_NAME_HINTS = [
  "charlotte",
  "serena",
  "grace",
  "elli",
  "domi",
  "sarah",
  "anna",
  "lily",
  "nova",
];

let cachedVoiceId: string | null = null;

async function fetchWorkspaceVoices(): Promise<RawElevenLabsVoice[]> {
  const client = getElevenLabsClient();
  const res = (await client.voices.getAll()) as {
    voices?: RawElevenLabsVoice[];
  };
  return res.voices ?? [];
}

/** Picks a warm, pleasant female Hochdeutsch voice for the live demo. */
export async function resolvePleasantDemoVoiceId(): Promise<string> {
  if (cachedVoiceId) return cachedVoiceId;

  const configured = process.env.DEMO_VOICE_FEMALE_DE?.trim();
  if (configured) {
    cachedVoiceId = configured;
    return configured;
  }

  const rawVoices = await fetchWorkspaceVoices();
  const catalog = filterAgentVoices(rawVoices);

  const preferred = catalog.find((v) => {
    const hay = v.name.toLowerCase();
    return (
      !v.swissGerman &&
      v.language === "Deutsch" &&
      PREFERRED_VOICE_NAME_HINTS.some((hint) => hay.includes(hint))
    );
  });

  if (preferred) {
    cachedVoiceId = preferred.id;
    return preferred.id;
  }

  const picked = pickAgentVoiceId(rawVoices, "female", "Deutsch");
  if (picked) {
    cachedVoiceId = picked;
    return picked;
  }

  const fallback = await resolveDemoVoiceId(
    "female-de",
    process.env.ELEVENLABS_API_KEY ?? ""
  );
  cachedVoiceId = fallback;
  return fallback;
}
