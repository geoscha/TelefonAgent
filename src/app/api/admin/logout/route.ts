import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  COOKIE_NAME,
  clearAdminSessionCookieOptions,
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST() {
  cookies().set(COOKIE_NAME, "", clearAdminSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
