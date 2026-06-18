import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { verifyAdminLogin } from "@/lib/admin/credentials";
import {
  COOKIE_NAME,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { username?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const code = body.code?.trim() ?? "";

  const valid = await verifyAdminLogin(username, code);
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Benutzername oder Code ist nicht korrekt." },
      { status: 401 }
    );
  }

  const token = createAdminSessionToken();
  cookies().set(COOKIE_NAME, token, adminSessionCookieOptions());

  return NextResponse.json({ ok: true });
}
