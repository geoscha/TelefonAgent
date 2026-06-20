import { NextResponse, type NextRequest } from "next/server";

import { APP_URL } from "@/lib/integrations/mail/config";
import { gmailExchangeCode } from "@/lib/integrations/mail/gmail";
import { outlookExchangeCode } from "@/lib/integrations/mail/outlook";
import {
  ensureSingleMailConnection,
  upsertMailConnection,
} from "@/lib/integrations/mail/store";

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

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${APP_URL}/integrationen?error=${reason}&provider=mail_${provider}`
    );

  if (oauthError) return fail("denied");
  if (provider !== "gmail" && provider !== "outlook") {
    return fail("unknown_provider");
  }

  const cookieState = req.cookies.get(`oauth_state_mail_${provider}`)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  try {
    const patch =
      provider === "gmail"
        ? await gmailExchangeCode(code)
        : await outlookExchangeCode(code);
    await ensureSingleMailConnection(provider);
    await upsertMailConnection(provider, patch);
  } catch {
    return fail("exchange_failed");
  }

  const res = NextResponse.redirect(
    `${APP_URL}/integrationen?connected=mail_${provider}`
  );
  res.cookies.delete(`oauth_state_mail_${provider}`);
  return res;
}
