import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { listAdminPoolNumbers } from "@/lib/admin/number-pool";
import { listRequests, type RequestStatus } from "@/lib/admin/requests";
import {
  sortRequestsForAdmin,
  suggestPhoneAssignments,
} from "@/lib/admin/suggest-numbers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = (searchParams.get("status") ?? "offen") as
    | RequestStatus
    | "all";
  const search = searchParams.get("q") ?? undefined;

  try {
    const [allRequests, pool] = await Promise.all([
      listRequests({ status: "all", search }),
      listAdminPoolNumbers(),
    ]);

    const requests =
      status === "all"
        ? allRequests
        : allRequests.filter((r) => r.status === status);

    const allPending = allRequests.filter(
      (r) => r.status === "offen" || r.status === "in_arbeit"
    );
    const suggestions = suggestPhoneAssignments(allPending, pool);
    const sorted = sortRequestsForAdmin(requests);
    const freeCount = pool.filter((n) => n.status === "frei").length;

    return NextResponse.json({
      ok: true,
      requests: sorted,
      suggestions,
      freeCount,
    });
  } catch (error) {
    console.error("[admin/requests]", error);
    const raw =
      error instanceof Error
        ? `${error.message} ${String(error.cause ?? "")}`
        : JSON.stringify(error);
    const message = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)
      ? "Datenbank nicht erreichbar. Internetverbindung und Supabase-Projekt prüfen."
      : "Anfragen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
