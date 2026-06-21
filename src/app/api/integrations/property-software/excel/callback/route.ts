import { NextResponse, type NextRequest } from "next/server";

import { syncAllCustomers } from "@/lib/customers/sync";
import { excelExchangeCode } from "@/lib/integrations/property-software/excel";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import {
  OAUTH_ORIGIN_COOKIE,
  resolveAppUrl,
} from "@/lib/integrations/oauth-origin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const appUrl =
    req.cookies.get(OAUTH_ORIGIN_COOKIE)?.value ?? resolveAppUrl(req);

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/integrationen?error=${reason}&provider=property_excel`
    );

  if (oauthError) return fail("denied");

  const cookieState = req.cookies.get("oauth_state_property_excel")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  try {
    const patch = await excelExchangeCode(code, appUrl);
    await upsertPropertySoftwareConnection("excel", patch);
  } catch {
    return fail("exchange_failed");
  }

  // Best-effort initial mirror so the customer page has data immediately.
  // Never blocks the redirect if the workbook can't be read yet.
  try {
    await syncAllCustomers();
  } catch {
    // ignore — the customer page / background sync will retry.
  }

  const res = NextResponse.redirect(
    `${appUrl}/integrationen?connected=property_excel`
  );
  res.cookies.delete("oauth_state_property_excel");
  res.cookies.delete(OAUTH_ORIGIN_COOKIE);
  return res;
}
