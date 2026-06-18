import { NextResponse, type NextRequest } from "next/server";

import { listAdminCustomers } from "@/lib/admin/customers";
import { requireAdminSession } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const search = req.nextUrl.searchParams.get("q") ?? undefined;
    const customers = await listAdminCustomers({ search });
    return NextResponse.json({ ok: true, customers });
  } catch (error) {
    console.error("[admin/customers]", error);
    return NextResponse.json(
      { error: "Kunden konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
