import { NextResponse } from "next/server";

import { fetchCustomersWithAppointments } from "@/lib/customers/fetch";
import { syncActiveCustomerSource } from "@/lib/customers/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Refresh the Supabase mirror in the background if it has gone stale.
    // Reads themselves always come from the mirror, never live.
    await syncActiveCustomerSource({ staleOnly: true });

    const result = await fetchCustomersWithAppointments();

    return NextResponse.json({
      ok: true,
      connected: result.connected,
      calendarConnected: result.calendarConnected,
      providers: result.providers,
      customers: result.customers,
      lastSyncedAt: result.lastSyncedAt,
      activeProvider: result.activeProvider,
      sourceReady: result.sourceReady,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    console.error("[customers]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Kunden konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}
