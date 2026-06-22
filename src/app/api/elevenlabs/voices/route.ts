import { NextResponse, type NextRequest } from "next/server";

import {
  AGENT_LANGUAGE_OPTIONS,
  filterAgentVoices,
  normalizeAgentLanguage,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const language = normalizeAgentLanguage(
      req.nextUrl.searchParams.get("language") ?? undefined
    );

    const client = getElevenLabsClient();
    const res = (await client.voices.getAll()) as {
      voices?: RawElevenLabsVoice[];
    };
    const rawVoices = res.voices ?? [];

    const voices = filterAgentVoices(rawVoices, language);
    const swissVoices = filterAgentVoices(rawVoices, "Schweizerdeutsch");
    const hasSwissVoice = swissVoices.some((v) => v.swissGerman);

    const languages = AGENT_LANGUAGE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      available: opt.value === "Deutsch" || hasSwissVoice || voices.length > 0,
    }));

    return NextResponse.json({ ok: true, voices, languages, language });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
