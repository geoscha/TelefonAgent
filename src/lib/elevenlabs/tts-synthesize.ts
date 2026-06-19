import "server-only";

import {
  DEMO_TTS_ATTEMPTS,
  DEMO_TTS_VOICE_SETTINGS,
} from "@/lib/demo/tts-text";

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

export async function synthesizeElevenLabsSpeech(
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
