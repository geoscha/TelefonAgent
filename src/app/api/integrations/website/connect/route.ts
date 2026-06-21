import { NextResponse } from "next/server";

import {
  connectWebsiteIntegration,
  refreshWebsiteIntegration,
} from "@/lib/integrations/website/sync";
import { validateWebsiteUrl } from "@/lib/integrations/website/scrape";
import { toPublicWebsiteStatus } from "@/lib/integrations/website/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { url?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  try {
    if (body.refresh) {
      const integration = await refreshWebsiteIntegration();
      return NextResponse.json({
        ok: true,
        website: toPublicWebsiteStatus(integration),
      });
    }

    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Bitte geben Sie eine Website-URL ein." },
        { status: 400 }
      );
    }

    const validated = validateWebsiteUrl(url);
    if (!validated.ok) {
      return NextResponse.json(
        { ok: false, error: validated.error },
        { status: 400 }
      );
    }

    const integration = await connectWebsiteIntegration(validated.url);
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
            : "Website konnte nicht verbunden werden.",
      },
      { status: 400 }
    );
  }
}
