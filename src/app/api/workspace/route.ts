import { NextResponse } from "next/server";

import { getPhoneOnboardingState } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { hasApiKey } from "@/lib/elevenlabs/client";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { isEnrichmentEnabled } from "@/lib/enrichment";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Fast combined payload for Telefonagent + Telefonnummern pages. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const [state, settings, numbers] = await Promise.all([
      getPhoneOnboardingState(),
      getSettings(),
      listUserPhoneNumbers(userId),
    ]);

    return NextResponse.json({
      ok: true,
      phase: state.phase,
      pendingRequest: state.pendingRequest,
      pendingRequests: state.pendingRequests,
      settings,
      numbers,
      capabilities: {
        hasApiKey: hasApiKey(),
        enrichmentEnabled: await isEnrichmentEnabled(),
        forwardingNumber: settings.linkerForwardingNumber ?? null,
        defaultSystemPrompt: buildSystemPrompt(
          settings.agentName || "Linker Telefonagent"
        ),
      },
    });
  } catch (error) {
    console.error("[workspace]", error);
    return NextResponse.json(
      { ok: false, error: "Workspace konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
