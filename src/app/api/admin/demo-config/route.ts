import { NextResponse, type NextRequest } from "next/server";

import {
  clearDemoOutboundConfig,
  getDemoOutboundConfigPublic,
  updateDemoOutboundConfig,
} from "@/lib/admin/demo-config";
import { requireAdminSession } from "@/lib/admin/guard";
import { resetDemoCallTargetCache } from "@/lib/demo/ensure-demo-agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const config = await getDemoOutboundConfigPublic();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    console.error("[admin/demo-config GET]", error);
    return NextResponse.json(
      { error: "Demo-Einstellungen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { phoneNumber?: string; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    if (body.clear) {
      await clearDemoOutboundConfig();
      resetDemoCallTargetCache();
      const config = await getDemoOutboundConfigPublic();
      return NextResponse.json({ ok: true, config });
    }

    if (!body.phoneNumber?.trim()) {
      return NextResponse.json(
        { error: "Bitte eine Telefonnummer angeben." },
        { status: 400 }
      );
    }

    const config = await updateDemoOutboundConfig({
      phoneNumber: body.phoneNumber,
    });
    resetDemoCallTargetCache();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
