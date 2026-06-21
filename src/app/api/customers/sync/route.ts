import { NextResponse, type NextRequest } from "next/server";

import { syncActiveCustomerSource } from "@/lib/customers/sync";

export const dynamic = "force-dynamic";

/**
 * Re-sync the active customer database. Pass `{ staleOnly: true }` for the
 * automatic hourly/app-open refresh (only re-pulls when the mirror is older
 * than the TTL); the default forces a full re-sync (manual "sync now").
 */
export async function POST(req: NextRequest) {
  try {
    let staleOnly = false;
    try {
      const body = (await req.json()) as { staleOnly?: boolean };
      staleOnly = Boolean(body?.staleOnly);
    } catch {
      staleOnly = false;
    }

    const result = await syncActiveCustomerSource(
      staleOnly ? { staleOnly: true } : { force: true }
    );
    if (!result) {
      // staleOnly: mirror still fresh (or no source) — nothing to do.
      if (staleOnly) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Keine Kundendatenquelle ausgewählt oder nicht verbunden.",
        },
        { status: 400 }
      );
    }

    const errors = result.error ? [`${result.name}: ${result.error}`] : undefined;

    return NextResponse.json({
      ok: true,
      total: result.records,
      results: [result],
      errors,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    console.error("[customers/sync]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Synchronisierung fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
