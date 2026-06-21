import { NextResponse } from "next/server";

import {
  PROPERTY_SOFTWARE_PROVIDERS,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import { removePropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export const dynamic = "force-dynamic";

export async function POST(
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

  await removePropertySoftwareConnection(provider);
  return NextResponse.json({ ok: true });
}
