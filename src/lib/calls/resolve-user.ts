import "server-only";

import { normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoredAgent } from "@/lib/onboarding-types";

/** Maps an incoming call (webhook) to the owning tenant. */
export async function resolveUserIdForIncomingCall(options: {
  agentId?: string | null;
  phoneNumberId?: string | null;
  agentNumber?: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();

  if (options.agentId) {
    const { data } = await admin
      .from("app_settings")
      .select("user_id")
      .eq("agent_id", options.agentId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;

    const { data: withAgents } = await admin
      .from("app_settings")
      .select("user_id, agents")
      .not("agents", "eq", "[]");

    for (const row of withAgents ?? []) {
      const agents = row.agents as StoredAgent[] | null;
      if (Array.isArray(agents) && agents.some((a) => a.id === options.agentId)) {
        return row.user_id as string;
      }
    }
  }

  if (options.phoneNumberId) {
    const { data } = await admin
      .from("user_phone_numbers")
      .select("user_id")
      .eq("elevenlabs_phone_number_id", options.phoneNumberId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;

    const { data: settingsRow } = await admin
      .from("app_settings")
      .select("user_id")
      .eq("elevenlabs_phone_number_id", options.phoneNumberId)
      .maybeSingle();
    if (settingsRow?.user_id) return settingsRow.user_id as string;

    const { data: poolRow } = await admin
      .from("forwarding_number_pool")
      .select("assigned_user_id")
      .eq("elevenlabs_phone_number_id", options.phoneNumberId)
      .maybeSingle();
    if (poolRow?.assigned_user_id) return poolRow.assigned_user_id as string;
  }

  if (options.agentNumber) {
    const normalized = normalizePhoneNumber(options.agentNumber);

    const { data: phoneRow } = await admin
      .from("user_phone_numbers")
      .select("user_id")
      .eq("phone_number", normalized)
      .maybeSingle();
    if (phoneRow?.user_id) return phoneRow.user_id as string;

    const { data } = await admin
      .from("app_settings")
      .select("user_id")
      .eq("cura_forwarding_number", normalized)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;

    const { data: poolRow } = await admin
      .from("forwarding_number_pool")
      .select("assigned_user_id")
      .eq("phone_number", normalized)
      .maybeSingle();
    if (poolRow?.assigned_user_id) return poolRow.assigned_user_id as string;
  }

  return null;
}
