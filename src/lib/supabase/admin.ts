import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Row Level Security — use ONLY in
 * trusted server contexts that have no user session (e.g. the ElevenLabs
 * post-call webhook and the agent tool endpoint), and always scope queries to
 * an explicit user_id resolved from the request (e.g. via the agent_id).
 *
 * Never import this from a Client Component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase Admin-Client benötigt NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
