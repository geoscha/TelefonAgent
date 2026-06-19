import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  findAdminSecretEntry,
  getAdminSecretsInventory,
  groupAdminSecrets,
} from "@/lib/admin/secrets-inventory";
import { applyAdminSecretUpdate } from "@/lib/admin/secrets-inventory-update";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const secrets = await getAdminSecretsInventory();
  return NextResponse.json({
    ok: true,
    secrets,
    groups: groupAdminSecrets(secrets),
    configuredCount: secrets.filter((entry) => entry.configured).length,
    totalCount: secrets.length,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { id?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const id = body.id?.trim();
  const value = body.value ?? "";
  if (!id) {
    return NextResponse.json({ error: "Eintrag fehlt." }, { status: 400 });
  }

  const entry = await findAdminSecretEntry(id);
  if (!entry?.editable || !entry.editAction) {
    return NextResponse.json(
      { error: "Dieser Eintrag kann nicht bearbeitet werden." },
      { status: 400 }
    );
  }

  try {
    await applyAdminSecretUpdate(entry.editAction, value);
    const secrets = await getAdminSecretsInventory();
    return NextResponse.json({
      ok: true,
      secrets,
      groups: groupAdminSecrets(secrets),
      configuredCount: secrets.filter((item) => item.configured).length,
      totalCount: secrets.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
