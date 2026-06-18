import { NextResponse, type NextRequest } from "next/server";

import {
  getAdminUsername,
  updateAdminCredentials,
} from "@/lib/admin/credentials";
import { requireAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const username = await getAdminUsername();
  return NextResponse.json({ ok: true, username });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { username?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!body.username?.trim() || !body.code?.trim()) {
    return NextResponse.json(
      { error: "Benutzername und Code erforderlich." },
      { status: 400 }
    );
  }

  try {
    await updateAdminCredentials(body.username, body.code);
    return NextResponse.json({ ok: true, username: body.username.trim() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
