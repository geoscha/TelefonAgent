import { NextResponse } from "next/server";

import { deleteStoredCall } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Anruf-ID fehlt." },
        { status: 400 }
      );
    }

    const deleted = await deleteStoredCall(id);
    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: "Anruf nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[calls/delete]", error);
    return NextResponse.json(
      { ok: false, error: "Anruf konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}
