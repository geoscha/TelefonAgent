import { NextResponse } from "next/server";

import {
  activateUserPhoneNumber,
  removeUserPhoneNumber,
} from "@/lib/phone/numbers";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const numbers = await removeUserPhoneNumber(params.id);
    return NextResponse.json({ ok: true, numbers });
  } catch (error) {
    console.error("[phone/numbers/delete]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nummer konnte nicht entfernt werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const phone = await activateUserPhoneNumber(params.id);
    return NextResponse.json({ ok: true, phone });
  } catch (error) {
    console.error("[phone/numbers/activate]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Nummer konnte nicht aktiviert werden.",
      },
      { status: 500 }
    );
  }
}
