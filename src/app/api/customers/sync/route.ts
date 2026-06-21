import { NextResponse } from "next/server";

import { syncActiveCustomerSource } from "@/lib/customers/sync";

export const dynamic = "force-dynamic";

/** Force a full re-sync of the active customer database. */
export async function POST() {
  try {
    const result = await syncActiveCustomerSource({ force: true });
    if (!result) {
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
