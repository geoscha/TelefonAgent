import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingsForUser } from "@/lib/store";

export async function getAgentUsageSeconds(
  userId: string,
  agentId: string
): Promise<number> {
  const admin = createAdminClient();
  const settings = await getSettingsForUser(userId);
  const agents = settings.agents ?? [];
  const includeUnattributed =
    agents.length === 1 && agents[0]?.id === agentId;

  let query = admin
    .from("calls")
    .select("duration_seconds")
    .eq("user_id", userId);

  if (includeUnattributed) {
    query = query.or(`agent_id.eq.${agentId},agent_id.is.null`);
  } else {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[agent-usage] load failed:", error.message);
    return 0;
  }

  return (data ?? []).reduce(
    (sum, row) => sum + (Number(row.duration_seconds) || 0),
    0
  );
}
