import { NextResponse } from "next/server";

import {
  buildDemoSystemPrompt,
  fallbackDemoReply,
  type DemoMessage,
} from "@/lib/demo/responses";
import { getDemoVoicePreset } from "@/lib/demo/voices";
import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: DemoMessage[];
      language?: string;
      voice?: string;
    };
    const messages = body.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const preset = getDemoVoicePreset(body.voice ?? "female-de");
    const language =
      (body.language as AgentLanguageLabel | undefined) ?? preset.language;

    if (!lastUser?.content.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nachricht fehlt." },
        { status: 400 }
      );
    }

    const reply = await generateReply(messages, lastUser.content, language);
    return NextResponse.json({ ok: true, reply });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Antwort konnte nicht erzeugt werden." },
      { status: 500 }
    );
  }
}

async function generateReply(
  messages: DemoMessage[],
  userText: string,
  language: AgentLanguageLabel
): Promise<string> {
  const apiKey = process.env.ENRICHMENT_API_KEY;
  if (!apiKey) return fallbackDemoReply(userText, language);

  const baseUrl = (
    process.env.ENRICHMENT_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.ENRICHMENT_MODEL ?? "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 200,
      messages: [
        { role: "system", content: buildDemoSystemPrompt(language) },
        ...messages.slice(-8).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    }),
  });

  if (!response.ok) return fallbackDemoReply(userText, language);

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  return content || fallbackDemoReply(userText, language);
}
