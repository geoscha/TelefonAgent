import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { syncOAuthProfile } from "@/lib/auth/sync-oauth-profile";
import { provisionCurrentUser } from "@/lib/provision";

function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/anrufe";
  }
  return value;
}

function redirectBase(request: NextRequest, origin: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  return isLocalEnv || !forwardedHost ? origin : `https://${forwardedHost}`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
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

  const base = redirectBase(request, origin);
  let response = NextResponse.redirect(`${base}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.redirect(`${base}${next}`);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
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
      msg.includes("fetch failed") || msg.includes("enotfound")
        ? "oauth_network"
        : msg.includes("missing oauth secret")
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

  await provisionCurrentUser().catch((err) =>
    console.warn("[auth/callback] provision skipped:", err)
  );

  return response;
}
