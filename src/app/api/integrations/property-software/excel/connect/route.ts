import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import {
  excelAuthUrl,
  isExcelConfigured,
} from "@/lib/integrations/property-software/excel";
import {
  OAUTH_ORIGIN_COOKIE,
  resolveAppUrl,
} from "@/lib/integrations/oauth-origin";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isExcelConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Microsoft OAuth ist noch nicht konfiguriert.",
      },
      { status: 503 }
    );
  }

  const appUrl = resolveAppUrl(req);

  try {
    await requireUserId();
  } catch {
    return NextResponse.redirect(`${appUrl}/login?next=/integrationen`);
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(excelAuthUrl(state, appUrl));
  res.cookies.set("oauth_state_property_excel", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set(OAUTH_ORIGIN_COOKIE, appUrl, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
