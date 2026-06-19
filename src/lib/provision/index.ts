import "server-only";

import { hasApiKey } from "@/lib/elevenlabs/client";
import { linkUserPhoneToAgent } from "@/lib/elevenlabs/sync-agent";
import { getSettings, type ElevenLabsSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export interface ProvisionResult {
  ok: boolean;
  alreadyProvisioned?: boolean;
  settings: ElevenLabsSettings;
  message?: string;
}

/**
 * Links an existing phone number to the user's active agent after onboarding.
 * Pool numbers are assigned automatically when available.
 */
export async function provisionCurrentUser(): Promise<ProvisionResult> {
  const settings = await getSettings();

  if (
    settings.onboardingPhase &&
    settings.onboardingPhase !== "fertig" &&
    settings.onboardingPhase !== "agent"
  ) {
    return {
      ok: true,
      settings,
      message: "Onboarding läuft — freie Nummer wird automatisch zugewiesen.",
    };
  }

  if (!hasApiKey()) {
    return {
      ok: false,
      settings,
      message: "ELEVENLABS_API_KEY fehlt.",
    };
  }

  const userId = await requireUserId();
  let next = settings;

  if (
    next.curaForwardingNumber &&
    next.elevenLabsPhoneNumberId &&
    next.agentId
  ) {
    await linkUserPhoneToAgent(userId).catch((err) =>
      console.warn("[provision] link skipped:", err)
    );
    next = await getSettings();
    return { ok: true, alreadyProvisioned: true, settings: next };
  }

  return {
    ok: true,
    settings: next,
    message: "Bereit — Nummer und Agent werden im Onboarding eingerichtet.",
  };
}
