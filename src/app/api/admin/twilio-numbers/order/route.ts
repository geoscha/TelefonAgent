import { NextResponse, type NextRequest } from "next/server";

import { orderTwilioNumberToPool } from "@/lib/admin/twilio-number-order";
import { requireAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    phoneNumber?: string;
    twilioAccountId?: string;
    elevenLabsAccountId?: string;
    countryCode?: string;
    addressSid?: string;
    bundleSid?: string;
    numberType?: "Mobile" | "Local";
    endUserType?: "individual" | "business";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!body.phoneNumber?.trim()) {
    return NextResponse.json(
      { error: "Bitte eine Nummer angeben." },
      { status: 400 }
    );
  }

  try {
    const result = await orderTwilioNumberToPool(body.phoneNumber, {
      twilioAccountId: body.twilioAccountId,
      elevenLabsAccountId: body.elevenLabsAccountId,
      countryCode: body.countryCode,
      addressSid: body.addressSid,
      bundleSid: body.bundleSid,
      numberType: body.numberType,
      endUserType: body.endUserType,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[admin/twilio-numbers/order]", error);
    const message =
      error instanceof Error ? error.message : "Bestellung fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
