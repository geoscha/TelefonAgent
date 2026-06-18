import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { syncOAuthProfile } from "@/lib/auth/sync-oauth-profile";
import { grantWelcomeTokensIfNeeded } from "@/lib/billing/tokens";
import { provisionCurrentUser } from "@/lib/provision";

function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/anrufe";
  }
  return value;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const oauthError = searchParams.get("error");

  const loginUrl = new URL("/login", origin);

  if (oauthError) {
    loginUrl.searchParams.set(
      "error",
      oauthError === "access_denied" ? "oauth_cancelled" : "oauth"
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", "auth");
    return NextResponse.redirect(loginUrl);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.warn("[auth/callback] exchange failed:", error.message);
    const msg = error.message.toLowerCase();
    loginUrl.searchParams.set(
      "error",
      msg.includes("missing oauth secret")
        ? "oauth_missing_secret"
        : msg.includes("not enabled") || msg.includes("unsupported provider")
          ? "oauth_not_configured"
          : "oauth"
    );
    return NextResponse.redirect(loginUrl);
  }

  await syncOAuthProfile(supabase).catch((err) =>
    console.warn("[auth/callback] profile sync skipped:", err)
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    await grantWelcomeTokensIfNeeded(user.id).catch((err) =>
      console.error("[auth/callback] welcome tokens failed:", err)
    );
  }

  await provisionCurrentUser().catch((err) =>
    console.warn("[auth/callback] provision skipped:", err)
  );

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const redirectBase =
    isLocalEnv || !forwardedHost ? origin : `https://${forwardedHost}`;

  return NextResponse.redirect(`${redirectBase}${next}`);
}
