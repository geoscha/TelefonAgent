import { NextResponse, type NextRequest } from "next/server";

import {
  getEnrichmentConfigPublic,
  updateEnrichmentConfig,
} from "@/lib/admin/enrichment-config";
import { requireAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const config = await getEnrichmentConfigPublic();
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    clearApiKey?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    await updateEnrichmentConfig(body);
    const config = await getEnrichmentConfigPublic();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
