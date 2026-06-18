import { NextResponse } from "next/server";

import {
  describeElevenLabsError,
  getElevenLabsClient,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { isEnrichmentEnabled } from "@/lib/enrichment";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { reconcileUserPhoneAgentLink } from "@/lib/elevenlabs/sync-agent";
import { getSettings, updateSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Current connection status + which capabilities are configured server-side. */
export async function GET() {
  let settings = await getSettings();

  // Re-link phone → agent for onboarded users (fixes stale ElevenLabs assignments).
  if (
    hasApiKey() &&
    settings.agentId &&
    settings.curaForwardingNumber &&
    (settings.onboardingPhase === "fertig" ||
      settings.onboardingPhase === "agent" ||
      !settings.onboardingPhase)
  ) {
    try {
      const userId = await requireUserId();
      await reconcileUserPhoneAgentLink(userId);
      settings = await getSettings();
    } catch (error) {
      console.warn("[connect] phone-agent reconcile failed:", error);
    }
  }

  return NextResponse.json({
    ok: true,
    settings,
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

/** Validate the configured API key against a real read endpoint (list agents). */
export async function POST() {
  try {
    const client = getElevenLabsClient();
    const res = (await client.conversationalAi.agents.list()) as {
      agents?: unknown[];
    };
    const count = res.agents?.length ?? 0;

    const settings = await updateSettings({
      connected: true,
      workspaceInfo: `${count} Agent${count === 1 ? "" : "en"} im Workspace`,
      lastSync: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    await updateSettings({ connected: false });
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
