import { NextResponse, type NextRequest } from "next/server";

import { googleExchangeCode, microsoftExchangeCode } from "@/lib/calendar";
import { APP_URL } from "@/lib/calendar/config";
import { upsertCalendar } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${APP_URL}/einstellungen?error=${reason}&provider=${provider}#kalender`
    );

  if (oauthError) return fail("denied");
  if (provider !== "google" && provider !== "microsoft") {
    return fail("unknown_provider");
  }

  const cookieState = req.cookies.get(`oauth_state_${provider}`)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  try {
    const patch =
      provider === "google"
        ? await googleExchangeCode(code)
        : await microsoftExchangeCode(code);
    await upsertCalendar(provider, patch);
  } catch {
    return fail("exchange_failed");
  }

  const res = NextResponse.redirect(
    `${APP_URL}/einstellungen?connected=${provider}#kalender`
  );
  res.cookies.delete(`oauth_state_${provider}`);
  return res;
}
