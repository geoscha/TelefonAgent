import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

function readOAuthDisplayName(metadata: Record<string, unknown>): string {
  const candidates = [
    metadata.name,
    metadata.full_name,
    metadata.given_name,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

/** Ensures Google/OAuth users get a profile name (trigger may only see `name`). */
export async function syncOAuthProfile(
  supabase: SupabaseClient
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const displayName = readOAuthDisplayName(user.user_metadata ?? {});
  const email = user.email?.trim() ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();

  const patch: { name?: string; email?: string } = {};

  if (displayName && (!profile?.name || !profile.name.trim())) {
    patch.name = displayName;
  }

  if (email && profile?.email !== email) {
    patch.email = email;
  }

  if (Object.keys(patch).length === 0) return;

  await supabase.from("profiles").update(patch).eq("id", user.id);
}
