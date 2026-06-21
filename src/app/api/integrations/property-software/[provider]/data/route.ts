import { NextResponse } from "next/server";

import { fetchPropertySoftwareData } from "@/lib/integrations/property-software/data";
import {
  PROPERTY_SOFTWARE_PROVIDERS,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const provider = raw as PropertySoftwareProviderId;

  if (!PROPERTY_SOFTWARE_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unbekannter Anbieter." },
      { status: 400 }
    );
  }

  try {
    const data = await fetchPropertySoftwareData(provider);
    return NextResponse.json({ ok: true, provider, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Daten konnten nicht geladen werden.";
    const status = message.includes("Keine aktive") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
