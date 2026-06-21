import { NextResponse, type NextRequest } from "next/server";

import { normalizeAssistantBranch } from "@/lib/assistant-branch";
import {
  greetingForAssistantName,
  suggestAssistantName,
} from "@/lib/elevenlabs/assistant-names";
import {
  generateAgentDraft,
  type GenerateAgentInput,
} from "@/lib/elevenlabs/generate-agent";
import {
  filterAgentVoices,
  normalizeAgentLanguage,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import {
  pickAgentVoiceId,
  pickDefaultAgentVoiceForLanguage,
  type AgentVoiceGender,
} from "@/lib/elevenlabs/pick-voice";
import { getProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      branch?: string;
      industry?: string;
      website?: string;
      gender?: string;
      language?: string;
      keepVoice?: boolean;
    };

    const branch = normalizeAssistantBranch(body.branch);
    const industry = body.industry?.trim();
    if (!body.branch && industry) {
      const lowered = industry.toLowerCase();
      if (lowered.includes("coiff") || lowered.includes("salon")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Bitte Branche aus der Liste wählen.",
          },
          { status: 400 }
        );
      }
    }

    const gender: AgentVoiceGender | undefined =
      body.gender === "female"
        ? "female"
        : body.gender === "male"
          ? "male"
          : undefined;
    const language = normalizeAgentLanguage(body.language);
    const keepVoice = Boolean(body.keepVoice);
    const profile = await getProfile();
    const ownerName = profile.name?.trim() || undefined;

    const input: GenerateAgentInput = {
      branch,
      website: body.website?.trim() || undefined,
      ...(gender ? { gender } : {}),
      language,
      ownerName,
    };

    const draft = await generateAgentDraft(input);

    let voiceId: string | undefined;
    let voiceName: string | undefined;
    let displayName = suggestAssistantName(gender ?? "female");

    if (!keepVoice) {
      const client = getElevenLabsClient();
      const voiceRes = (await client.voices.getAll()) as {
        voices?: RawElevenLabsVoice[];
      };
      const rawVoices = voiceRes.voices ?? [];
      const catalog = filterAgentVoices(rawVoices);
      if (gender) {
        voiceId = pickAgentVoiceId(rawVoices, gender, language);
      } else {
        voiceId = pickDefaultAgentVoiceForLanguage(rawVoices, language)?.id;
      }
      const picked = catalog.find((v) => v.id === voiceId);
      voiceName = picked?.name;
      displayName = picked?.displayName ?? displayName;

      if (!voiceId) {
        return NextResponse.json(
          { ok: false, error: "Keine passende Stimme gefunden." },
          { status: 503 }
        );
      }
    }

    const resolvedName = displayName;
    const resolvedGreeting = greetingForAssistantName(resolvedName, language);

    return NextResponse.json({
      ok: true,
      draft: {
        ...draft,
        name: resolvedName,
        greeting: resolvedGreeting,
        ...(voiceId ? { voiceId, voiceName } : {}),
      },
      meta: {
        aiGenerated: draft.aiGenerated,
        websiteAnalyzed: draft.websiteAnalyzed,
      },
    });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
