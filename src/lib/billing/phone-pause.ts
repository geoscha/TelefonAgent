import "server-only";

import { TOKEN_RELEASE_DAYS } from "@/lib/billing/tokens";
import { hasApiKey, getElevenLabsClient } from "@/lib/elevenlabs/client";
import { linkUserPhoneToAgent } from "@/lib/elevenlabs/sync-agent";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingsForUser, updateSettingsForUser } from "@/lib/store";

async function unlinkPhoneFromAgent(elevenLabsPhoneNumberId: string): Promise<void> {
  if (!hasApiKey()) return;
  const client = getElevenLabsClient();
  try {
    await client.conversationalAi.phoneNumbers.update(elevenLabsPhoneNumberId, {
      agentId: undefined,
    });
  } catch (err) {
    console.warn("[phone-pause] unlink failed:", err);
  }
}

/** Unlinks phones from the agent in ElevenLabs — agents and DB records stay intact. */
export async function pauseUserPhones(userId: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: profile } = await admin
    .from("profiles")
    .select("phone_paused_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.phone_paused_at) {
    await admin
      .from("profiles")
      .update({ phone_paused_at: now })
      .eq("id", userId);
  }

  await admin
    .from("user_phone_numbers")
    .update({ paused_at: now, updated_at: now })
    .eq("user_id", userId)
    .is("paused_at", null);

  const phones = await listUserPhoneNumbers(userId);
  for (const phone of phones) {
    if (phone.elevenLabsPhoneNumberId) {
      await unlinkPhoneFromAgent(phone.elevenLabsPhoneNumberId);
    }
  }
}

/** Relinks phones to the agent after a successful top-up. */
export async function resumeUserPhones(userId: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("profiles")
    .update({ phone_paused_at: null })
    .eq("id", userId);

  await admin
    .from("user_phone_numbers")
    .update({ paused_at: null, updated_at: now })
    .eq("user_id", userId);

  const settings = await getSettingsForUser(userId);
  if (settings.agentId) {
    try {
      await linkUserPhoneToAgent(userId);
    } catch (err) {
      console.warn("[phone-pause] relink after resume failed:", err);
    }
  }
}

/** Releases pool numbers after 7 days without top-up while paused. */
export async function releaseStalePausedPhones(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("phone_paused_at, last_token_topup_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.phone_paused_at) return false;

  const pausedAt = new Date(profile.phone_paused_at);
  const lastTopUp = profile.last_token_topup_at
    ? new Date(profile.last_token_topup_at)
    : null;

  if (lastTopUp && lastTopUp >= pausedAt) {
    return false;
  }

  const releaseAfter = new Date(pausedAt);
  releaseAfter.setDate(releaseAfter.getDate() + TOKEN_RELEASE_DAYS);
  if (new Date() < releaseAfter) return false;

  const phones = await listUserPhoneNumbers(userId);
  const poolPhones = phones.filter((p) => p.source === "pool");

  for (const phone of poolPhones) {
    if (phone.elevenLabsPhoneNumberId) {
      await unlinkPhoneFromAgent(phone.elevenLabsPhoneNumberId);
    }
    const { releasePoolNumberAssignment } = await import("@/lib/billing/phone-billing");
    await releasePoolNumberAssignment(phone.phoneNumber, userId);

    await admin
      .from("user_phone_numbers")
      .delete()
      .eq("id", phone.id)
      .eq("user_id", userId);
  }

  const remaining = await listUserPhoneNumbers(userId);
  const primary = remaining.find((p) => p.isPrimary) ?? remaining[0] ?? null;

  if (primary) {
    await updateSettingsForUser(userId, {
      curaForwardingNumber: primary.phoneNumber,
      elevenLabsPhoneNumberId: primary.elevenLabsPhoneNumberId,
      forwardingStatus: primary.forwardingStatus,
    });
  } else if (poolPhones.length > 0) {
    await updateSettingsForUser(userId, {
      curaForwardingNumber: undefined,
      elevenLabsPhoneNumberId: undefined,
      forwardingStatus: "nicht_eingerichtet",
      onboardingPhase: "nummer_anfragen",
    });
  }

  await admin
    .from("profiles")
    .update({ phone_paused_at: null })
    .eq("id", userId);

  return poolPhones.length > 0;
}
