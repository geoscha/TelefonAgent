import { NextResponse } from "next/server";

import { getDemoAgentConfigPublic } from "@/lib/admin/demo-config";
import { getDemoVoicePreset } from "@/lib/demo/voices";
import { demoGreeting } from "@/lib/demo/responses";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getDemoAgentConfigPublic();
    const preset = getDemoVoicePreset(config.voicePreset);
    return NextResponse.json({
      ok: true,
      voicePreset: config.voicePreset,
      greeting: demoGreeting(preset.language, config.greeting),
      contextConfigured: Boolean(config.context),
    });
  } catch (error) {
    console.error("[demo/config GET]", error);
    return NextResponse.json(
      { ok: false, error: "Demo-Konfiguration nicht verfügbar." },
      { status: 500 }
    );
  }
}
