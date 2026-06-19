import { NextResponse, type NextRequest } from "next/server";

import {
  createPaygSetupCheckout,
  disablePayg,
  getPaygStatus,
} from "@/lib/billing/payg";
import { checkoutErrorMessage } from "@/lib/billing/stripe-config";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const status = await getPaygStatus(userId);
    return NextResponse.json({ ok: true, ...status });
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { url } = await createPaygSetupCheckout(userId, req);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    return NextResponse.json(
      { error: checkoutErrorMessage(error) },
      { status: 502 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await disablePayg(userId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }
}
