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
    const [requests, pool, allOpen, inArbeit] = await Promise.all([
      listRequests({ status, search }),
      listAdminPoolNumbers(),
      listRequests({ status: "offen" }),
      listRequests({ status: "in_arbeit" }),
    ]);
    const allPending = [...allOpen, ...inArbeit];
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
    return NextResponse.json(
      { ok: false, error: "Anfragen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
