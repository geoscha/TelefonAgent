import { NextResponse } from "next/server";

import {
  DEMO_TTS_ATTEMPTS,
  DEMO_TTS_VOICE_SETTINGS,
  prepareDemoTtsText,
} from "@/lib/demo/tts-text";
import { getDemoVoicePreset } from "@/lib/demo/voices";
import { resolveDemoVoiceId } from "@/lib/demo/voices-server";
import { hasApiKey } from "@/lib/elevenlabs/client";

export const dynamic = "force-dynamic";

type TtsFailure = {
  status: number;
  code?: string;
  message?: string;
};

async function readTtsFailure(res: Response): Promise<TtsFailure> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as {
      detail?: { code?: string; message?: string; status?: string };
    };
    const detail = json.detail;
    return {
      status: res.status,
      code: detail?.code ?? detail?.status,
      message: detail?.message,
    };
  } catch {
    return { status: res.status, message: text.slice(0, 200) };
  }
}

async function synthesizeDemoSpeech(
  voiceId: string,
  text: string,
  apiKey: string
): Promise<{ response: Response | null; failure?: TtsFailure }> {
  let lastFailure: TtsFailure | undefined;

  for (const attempt of DEMO_TTS_ATTEMPTS) {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: attempt.model_id,
          ...(attempt.language_code
            ? { language_code: attempt.language_code }
            : {}),
          voice_settings: DEMO_TTS_VOICE_SETTINGS,
        }),
        cache: "no-store",
      }
    );

    if (upstream.ok && upstream.body) {
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        return { response: upstream };
      }
    }

    lastFailure = await readTtsFailure(upstream);
  }

  return { response: null, failure: lastFailure };
}

function speakErrorResponse(failure?: TtsFailure) {
  if (
    failure?.code === "quota_exceeded" ||
    failure?.message?.toLowerCase().includes("quota")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Das ElevenLabs-Sprachkontingent ist aufgebraucht. Bitte Credits aufladen.",
        reason: "quota_exceeded",
      },
      { status: 503 }
    );
  }

  if (failure?.status === 401 || failure?.status === 403) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sprachausgabe nicht autorisiert. Bitte API-Schlüssel prüfen.",
        reason: "auth",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "Sprachausgabe fehlgeschlagen." },
    { status: 502 }
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; voice?: string };
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Text fehlt." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!hasApiKey() || !apiKey) {
      return NextResponse.json(
        { ok: false, error: "Sprachausgabe nicht konfiguriert." },
        { status: 503 }
      );
    }

    const preset = getDemoVoicePreset(body.voice ?? "female-de");
    const voiceId = await resolveDemoVoiceId(preset.id, apiKey);
    const spokenText = prepareDemoTtsText(text, preset.language);

    const { response: upstream, failure } = await synthesizeDemoSpeech(
      voiceId,
      spokenText.slice(0, 600),
      apiKey
    );

    if (!upstream?.body) {
      return speakErrorResponse(failure);
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sprachausgabe fehlgeschlagen." },
      { status: 500 }
    );
  }
}
