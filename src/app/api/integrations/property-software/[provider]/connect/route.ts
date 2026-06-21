import { NextResponse } from "next/server";

import { connectPropertySoftware } from "@/lib/integrations/property-software/connect";
import {
  PROPERTY_SOFTWARE_PROVIDERS,
  type PropertySoftwareProviderId,
} from "@/lib/integrations/property-software/provider-meta";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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

  if (provider === "excel") {
    return NextResponse.json(
      {
        ok: false,
        error: "Excel wird über Microsoft OAuth verbunden.",
      },
      { status: 400 }
    );
  }

  let body: {
    baseUrl?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    tenantId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  try {
    const patch = await connectPropertySoftware(provider, body);
    const conn = await upsertPropertySoftwareConnection(provider, patch);
    return NextResponse.json({
      ok: true,
      connection: {
        connected: true,
        accountLabel: conn.accountLabel,
        baseUrl: conn.baseUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Verbindung fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
