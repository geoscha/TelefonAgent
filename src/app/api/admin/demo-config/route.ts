import { NextResponse, type NextRequest } from "next/server";

import {
  clearDemoOutboundConfig,
  getDemoAgentConfigPublic,
  getDemoOutboundConfigPublic,
  updateDemoAgentConfig,
  updateDemoOutboundConfig,
} from "@/lib/admin/demo-config";
import { requireAdminSession } from "@/lib/admin/guard";
import { resetDemoCallTargetCache } from "@/lib/demo/ensure-demo-agent";
import { resetDemoVoiceCache } from "@/lib/demo/pleasant-voice";
import type { DemoVoicePresetId } from "@/lib/demo/voices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const [outbound, agent] = await Promise.all([
      getDemoOutboundConfigPublic(),
      getDemoAgentConfigPublic(),
    ]);
    return NextResponse.json({ ok: true, config: outbound, agent });
  } catch (error) {
    console.error("[admin/demo-config GET]", error);
    return NextResponse.json(
      { error: "Demo-Einstellungen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    phoneNumber?: string;
    clear?: boolean;
    voicePreset?: DemoVoicePresetId;
    greeting?: string | null;
    context?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    if (body.clear) {
      await clearDemoOutboundConfig();
      resetDemoCallTargetCache();
      resetDemoVoiceCache();
      const [config, agent] = await Promise.all([
        getDemoOutboundConfigPublic(),
        getDemoAgentConfigPublic(),
      ]);
      return NextResponse.json({ ok: true, config, agent });
    }

    if (
      body.voicePreset !== undefined ||
      body.greeting !== undefined ||
      body.context !== undefined
    ) {
      const agent = await updateDemoAgentConfig({
        voicePreset: body.voicePreset,
        greeting: body.greeting,
        context: body.context,
      });
      resetDemoCallTargetCache();
      resetDemoVoiceCache();
      const config = await getDemoOutboundConfigPublic();
      return NextResponse.json({ ok: true, config, agent });
    }

    if (!body.phoneNumber?.trim()) {
      return NextResponse.json(
        { error: "Bitte eine Telefonnummer angeben." },
        { status: 400 }
      );
    }

    const config = await updateDemoOutboundConfig({
      phoneNumber: body.phoneNumber,
    });
    resetDemoCallTargetCache();
    const agent = await getDemoAgentConfigPublic();
    return NextResponse.json({ ok: true, config, agent });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
