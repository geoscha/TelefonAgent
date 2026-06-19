import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  createTwilioAddress,
  listTwilioAddresses,
} from "@/lib/integrations/twilio-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const twilioAccountId = searchParams.get("twilioAccountId") ?? undefined;
  const country = (searchParams.get("country") ?? "").toUpperCase();

  try {
    const addresses = await listTwilioAddresses(twilioAccountId);
    const filtered = country
      ? addresses.filter((address) => address.isoCountry === country)
      : addresses;

    return NextResponse.json({
      ok: true,
      addresses: filtered,
      allAddresses: addresses,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Adressen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    twilioAccountId?: string;
    customerName?: string;
    street?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    isoCountry?: string;
    friendlyName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    const address = await createTwilioAddress(
      {
        customerName: body.customerName ?? "",
        street: body.street ?? "",
        city: body.city ?? "",
        region: body.region ?? "",
        postalCode: body.postalCode ?? "",
        isoCountry: body.isoCountry ?? "",
        friendlyName: body.friendlyName,
      },
      body.twilioAccountId
    );
    return NextResponse.json({ ok: true, address });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Adresse konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
