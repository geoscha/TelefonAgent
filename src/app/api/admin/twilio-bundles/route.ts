import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { listTwilioBundles, type TwilioEndUserType } from "@/lib/integrations/twilio-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const twilioAccountId = searchParams.get("twilioAccountId") ?? undefined;
  const country = (searchParams.get("country") ?? "").toUpperCase();
  const endUserType = searchParams.get("endUserType") as
    | TwilioEndUserType
    | null;

  try {
    const bundles = await listTwilioBundles(twilioAccountId, {
      countryCode: country || undefined,
      endUserType:
        endUserType === "individual" || endUserType === "business"
          ? endUserType
          : undefined,
    });

    return NextResponse.json({ ok: true, bundles });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Bundles konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
