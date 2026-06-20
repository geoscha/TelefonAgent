import { NextResponse, type NextRequest } from "next/server";

import { gmailExchangeCode } from "@/lib/integrations/mail/gmail";
import { outlookExchangeCode } from "@/lib/integrations/mail/outlook";
import {
  ensureSingleMailConnection,
  upsertMailConnection,
} from "@/lib/integrations/mail/store";
import {
  mailOAuthRedirectUri,
  OAUTH_ORIGIN_COOKIE,
  resolveAppUrl,
} from "@/lib/integrations/oauth-origin";

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
      `${appUrl}/integrationen?error=${reason}&provider=mail_${provider}`
    );

  if (oauthError) return fail("denied");
  if (provider !== "gmail" && provider !== "outlook") {
    return fail("unknown_provider");
  }

  const cookieState = req.cookies.get(`oauth_state_mail_${provider}`)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  const redirectUri = mailOAuthRedirectUri(provider, appUrl);

  try {
    const patch =
      provider === "gmail"
        ? await gmailExchangeCode(code, redirectUri)
        : await outlookExchangeCode(code, redirectUri);
    await ensureSingleMailConnection(provider);
    await upsertMailConnection(provider, patch);
  } catch {
    return fail("exchange_failed");
  }

  const res = NextResponse.redirect(
    `${appUrl}/integrationen?connected=mail_${provider}`
  );
  res.cookies.delete(`oauth_state_mail_${provider}`);
  res.cookies.delete(OAUTH_ORIGIN_COOKIE);
  return res;
}
