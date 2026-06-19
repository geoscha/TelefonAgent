import { NextResponse } from "next/server";

import {
  formatOperationInsufficientTokensMessage,
  GREETING_PREVIEW_COST_TOKENS,
} from "@/lib/billing/quota-display";
import {
  debitTokens,
  getTokenBalanceAmount,
} from "@/lib/billing/tokens";
import { prepareDemoTtsText } from "@/lib/demo/tts-text";
import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import {
  describeElevenLabsError,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { synthesizeElevenLabsSpeech } from "@/lib/elevenlabs/tts-synthesize";
import { buildVoicePreviewPhrase } from "@/lib/elevenlabs/voice-preview";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    const body = (await req.json()) as {
      voiceId?: string;
      voiceName?: string;
      language?: string;
      text?: string;
    };

    const voiceId = body.voiceId?.trim();
    const voiceName = body.voiceName?.trim();
    if (!voiceId || !voiceName) {
      return NextResponse.json(
        { ok: false, error: "Stimme fehlt." },
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

    const language = normalizeAgentLanguage(body.language);
    const customText = body.text?.trim();
    const spokenText = prepareDemoTtsText(
      customText || buildVoicePreviewPhrase(voiceName),
      language
    );

    if (customText) {
      const balance = await getTokenBalanceAmount(userId);
      if (balance < GREETING_PREVIEW_COST_TOKENS) {
        return NextResponse.json(
          {
            ok: false,
            error: formatOperationInsufficientTokensMessage(
              balance,
              GREETING_PREVIEW_COST_TOKENS,
              "die Begrüssungsvorschau"
            ),
            insufficientTokens: true,
            balance,
            required: GREETING_PREVIEW_COST_TOKENS,
          },
          { status: 402 }
        );
      }
    }

    const { response: upstream } = await synthesizeElevenLabsSpeech(
      voiceId,
      spokenText,
      apiKey
    );

    if (!upstream?.body) {
      return NextResponse.json(
        { ok: false, error: "Vorschau fehlgeschlagen." },
        { status: 502 }
      );
    }

    if (customText) {
      const debit = await debitTokens(
        userId,
        GREETING_PREVIEW_COST_TOKENS,
        "greeting_preview",
        `greeting-preview:${userId}:${Date.now()}`,
        { voiceId, textLength: spokenText.length }
      );

      if (!debit.ok && !debit.duplicate) {
        const after = debit.balance ?? 0;
        return NextResponse.json(
          {
            ok: false,
            error: formatOperationInsufficientTokensMessage(
              after,
              GREETING_PREVIEW_COST_TOKENS,
              "die Begrüssungsvorschau"
            ),
            insufficientTokens: true,
            balance: after,
            required: GREETING_PREVIEW_COST_TOKENS,
          },
          { status: 402 }
        );
      }
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
