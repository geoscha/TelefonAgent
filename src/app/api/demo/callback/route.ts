import { NextResponse } from "next/server";

import { initiateDemoCallback } from "@/lib/demo/outbound-call";
import type { DemoUseCaseId } from "@/lib/demo/use-cases";
import type { DemoVoicePresetId } from "@/lib/demo/voices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      phone?: string;
      useCaseId?: DemoUseCaseId;
      voice?: DemoVoicePresetId;
    };

    const result = await initiateDemoCallback({
      name: body.name ?? "",
      phone: body.phone ?? "",
      useCaseId: body.useCaseId ?? "cura",
      voice: body.voice,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: result.message.includes("gültige") ? 400 : 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      conversationId: result.conversationId,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Anruf konnte nicht gestartet werden." },
      { status: 500 }
    );
  }
}
