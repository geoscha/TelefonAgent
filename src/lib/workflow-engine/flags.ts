import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

function envEnabled(): boolean {
  const raw = process.env.WORKFLOW_ENGINE_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isWorkflowEngineEnvEnabled(): boolean {
  return envEnabled();
}

export async function isWorkflowEngineEnabledForUser(
  userId?: string
): Promise<boolean> {
  if (!envEnabled()) return false;
  if (!userId) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_engine_tenants")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return true;
  return Boolean(data.enabled);
}

export async function setWorkflowEngineForTenant(
  userId: string,
  enabled: boolean
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("workflow_engine_tenants").upsert(
    {
      user_id: userId,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}
