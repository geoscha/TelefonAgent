import { NextResponse } from "next/server";

import { getPhoneOnboardingState } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { hasApiKey } from "@/lib/elevenlabs/client";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { isEnrichmentEnabled } from "@/lib/enrichment";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();

  const state = await getPhoneOnboardingState();
  const settings = await getSettings();
  const numbers = await listUserPhoneNumbers(userId);

  return NextResponse.json({
    ok: true,
    phase: state.phase,
    pendingRequest: state.pendingRequest,
    pendingRequests: state.pendingRequests,
    settings: state.settings,
    numbers,
    capabilities: {
      hasApiKey: hasApiKey(),
      enrichmentEnabled: await isEnrichmentEnabled(),
      forwardingNumber: settings.curaForwardingNumber ?? null,
      defaultSystemPrompt: buildSystemPrompt(
        settings.agentName || "Cura Telefonagent"
      ),
    },
  });
}
