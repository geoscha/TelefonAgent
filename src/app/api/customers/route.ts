import { NextResponse } from "next/server";

import { fetchCustomersWithAppointments } from "@/lib/customers/fetch";
import { syncActiveCustomerSource } from "@/lib/customers/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Read straight from the Supabase mirror so the tab loads instantly —
    // never go live to Excel/property software here. The hourly/app-open
    // background sync (useBackgroundSync → POST /api/customers/sync) keeps the
    // mirror fresh. Only when nothing has ever been synced do we populate once
    // so the first visit isn't empty.
    let result = await fetchCustomersWithAppointments();
    if (
      result.sourceReady &&
      !result.lastSyncedAt &&
      result.customers.length === 0
    ) {
      await syncActiveCustomerSource({ force: true }).catch((error) => {
        console.error("[customers] initial sync failed", error);
      });
      result = await fetchCustomersWithAppointments();
    }

    return NextResponse.json({
      ok: true,
      connected: result.connected,
      calendarConnected: result.calendarConnected,
      providers: result.providers,
      customers: result.customers,
      craftsmen: result.craftsmen,
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
