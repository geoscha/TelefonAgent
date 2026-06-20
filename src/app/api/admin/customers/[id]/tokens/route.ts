import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getAdminCustomer } from "@/lib/admin/customers";
import { requireAdminSession } from "@/lib/admin/guard";
import { creditTokens } from "@/lib/billing/tokens";

export const dynamic = "force-dynamic";

const MAX_GRANT_TOKENS = 1_000_000;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { amount?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Bitte eine gültige Token-Anzahl angeben." },
      { status: 400 }
    );
  }
  if (amount > MAX_GRANT_TOKENS) {
    return NextResponse.json(
      {
        error: `Maximal ${MAX_GRANT_TOKENS.toLocaleString("de-CH")} Tokens pro Gutschrift.`,
      },
      { status: 400 }
    );
  }

  const customer = await getAdminCustomer(params.id);
  if (!customer) {
    return NextResponse.json({ error: "Kunde nicht gefunden." }, { status: 404 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  const referenceId = `admin_grant:${params.id}:${randomUUID()}`;
  const result = await creditTokens(
    params.id,
    amount,
    "admin_topup",
    referenceId,
    {
      grantedBy: "admin",
      ...(note ? { note } : {}),
    }
  );

  if (!result.ok && !result.duplicate) {
    console.error("[admin/customers/tokens] credit failed:", result.error);
    return NextResponse.json(
      { error: "Tokens konnten nicht gutgeschrieben werden." },
      { status: 502 }
    );
  }

  const updated = await getAdminCustomer(params.id);
  return NextResponse.json({
    ok: true,
    credited: amount,
    duplicate: Boolean(result.duplicate),
    balance: result.balance,
    customer: updated,
  });
}
