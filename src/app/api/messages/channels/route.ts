import { NextResponse } from "next/server";

import { listConnectedMessageChannels } from "@/lib/messages/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const channels = await listConnectedMessageChannels();
    return NextResponse.json({ ok: true, channels });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[messages/channels]", error);
    return NextResponse.json(
      { ok: false, error: "Kanäle konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
