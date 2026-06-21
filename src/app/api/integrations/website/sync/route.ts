import { NextResponse } from "next/server";

import { refreshWebsiteIntegration } from "@/lib/integrations/website/sync";
import { toPublicWebsiteStatus } from "@/lib/integrations/website/store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const integration = await refreshWebsiteIntegration();
    return NextResponse.json({
      ok: true,
      website: toPublicWebsiteStatus(integration),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Aktualisierung fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
