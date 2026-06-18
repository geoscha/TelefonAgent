import { NextResponse } from "next/server";

import { getPhoneOnboardingState } from "@/lib/phone/onboarding";
import { hasApiKey } from "@/lib/elevenlabs/client";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { isEnrichmentEnabled } from "@/lib/enrichment";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getPhoneOnboardingState();
  const settings = await getSettings();

  return NextResponse.json({
    ok: true,
    phase: state.phase,
    pendingRequest: state.pendingRequest,
    settings: state.settings,
    capabilities: {
      hasApiKey: hasApiKey(),
      enrichmentEnabled: isEnrichmentEnabled(),
      forwardingNumber: settings.curaForwardingNumber ?? null,
      defaultSystemPrompt: buildSystemPrompt(
        settings.agentName || "Cura Telefonagent"
      ),
    },
  });
}
