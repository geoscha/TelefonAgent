import "server-only";

import { teardownUserResources } from "@/lib/account/teardown";
import { createAdminClient } from "@/lib/supabase/admin";

/** Permanently deletes a user account and all associated data. */
export async function deleteUserAccount(userId: string): Promise<void> {
  await teardownUserResources(userId);
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();

  const { data: callAgg } = await admin
    .from("calls")
    .select("duration_seconds")
    .eq("user_id", userId);

  const callSeconds = (callAgg ?? []).reduce(
    (sum, call) => sum + (call.duration_seconds ?? 0),
    0
  );

  await admin.from("customer_registry").upsert(
    {
      id: userId,
      created_at: profile?.created_at ?? new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      call_seconds_lifetime: callSeconds,
    },
    { onConflict: "id" }
  );

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }
}
