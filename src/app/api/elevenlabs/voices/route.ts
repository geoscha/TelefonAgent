import { NextResponse } from "next/server";

import {
  AGENT_LANGUAGE_OPTIONS,
  filterAgentVoices,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = getElevenLabsClient();
    const res = (await client.voices.getAll()) as {
      voices?: RawElevenLabsVoice[];
    };

    const voices = filterAgentVoices(res.voices ?? []);
    const hasSwissVoice = voices.some((v) => v.swissGerman);

    const languages = AGENT_LANGUAGE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
      available: opt.value === "Deutsch" || hasSwissVoice || voices.length > 0,
    }));

    return NextResponse.json({ ok: true, voices, languages });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
