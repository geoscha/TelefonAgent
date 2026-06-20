import { NextResponse, type NextRequest } from "next/server";

import {
  googleExchangeCode,
  microsoftExchangeCode,
  ensureSingleCalendarConnection,
} from "@/lib/calendar";
import {
  calendarOAuthRedirectUri,
  OAUTH_ORIGIN_COOKIE,
  resolveAppUrl,
} from "@/lib/integrations/oauth-origin";
import { upsertCalendar } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const appUrl =
    req.cookies.get(OAUTH_ORIGIN_COOKIE)?.value ?? resolveAppUrl(req);

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/integrationen?error=${reason}&provider=${provider}`
    );

  if (oauthError) return fail("denied");
  if (provider !== "google" && provider !== "microsoft") {
    return fail("unknown_provider");
  }

  const cookieState = req.cookies.get(`oauth_state_${provider}`)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  const redirectUri = calendarOAuthRedirectUri(provider, appUrl);

  try {
    const patch =
      provider === "google"
        ? await googleExchangeCode(code, redirectUri)
        : await microsoftExchangeCode(code, redirectUri);
    await ensureSingleCalendarConnection(provider);
    await upsertCalendar(provider, patch);
  } catch {
    return fail("exchange_failed");
  }

  const res = NextResponse.redirect(
    `${appUrl}/integrationen?connected=${provider}`
  );
  res.cookies.delete(`oauth_state_${provider}`);
  res.cookies.delete(OAUTH_ORIGIN_COOKIE);
  return res;
}
