import { NextResponse } from "next/server";

import { listUserPhoneNumbers } from "@/lib/phone/numbers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const numbers = await listUserPhoneNumbers();
    return NextResponse.json({ ok: true, numbers });
  } catch (error) {
    console.error("[phone/numbers]", error);
    return NextResponse.json(
      { ok: false, error: "Nummern konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
