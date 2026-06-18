"use client";

import { mapGoogleSignInError } from "@/lib/auth/oauth-errors";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/client";

export type GoogleSignInIntent = "login" | "signup";

export function googleOAuthRedirectPath(intent: GoogleSignInIntent): string {
  return intent === "signup" ? "/telefonagent" : "/anrufe";
}

export async function signInWithGoogle(
  intent: GoogleSignInIntent = "login"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const next = googleOAuthRedirectPath(intent);
  const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    return {
      ok: false,
      error: mapGoogleSignInError(error.message),
    };
  }

  if (data.url) {
    window.location.assign(data.url);
    return { ok: true };
  }

  return {
    ok: false,
    error: "Google-Anmeldung konnte nicht gestartet werden.",
  };
}
