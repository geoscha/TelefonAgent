import { NextResponse } from "next/server";

import { disconnectWebsiteIntegration } from "@/lib/integrations/website/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await disconnectWebsiteIntegration();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Trennen fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
