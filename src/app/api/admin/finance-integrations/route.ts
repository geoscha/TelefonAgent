import { NextResponse, type NextRequest } from "next/server";

import {
  getFinanceIntegrationsPublic,
  updateFinanceIntegrations,
} from "@/lib/admin/finance-integrations";
import { requireAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const integrations = await getFinanceIntegrationsPublic();
  return NextResponse.json({ ok: true, integrations });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    elevenLabsApiKey?: string;
    stripeSecretKey?: string;
    usdToChfRate?: number;
    clearTwilio?: boolean;
    clearElevenLabs?: boolean;
    clearStripe?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    await updateFinanceIntegrations(body);
    const integrations = await getFinanceIntegrationsPublic();
    return NextResponse.json({ ok: true, integrations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
