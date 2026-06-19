import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { searchTwilioAvailableNumbers } from "@/lib/integrations/twilio-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contains = searchParams.get("contains") ?? undefined;
  const countryCode = searchParams.get("country") ?? "CH";
  const twilioAccountId = searchParams.get("twilioAccountId") ?? undefined;
  const limit = Math.min(
    30,
    Math.max(1, Number(searchParams.get("limit") ?? 15) || 15)
  );

  try {
    const numbers = await searchTwilioAvailableNumbers({
      countryCode,
      contains,
      limit,
      twilioAccountId,
    });
    return NextResponse.json({ ok: true, numbers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Suche fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
