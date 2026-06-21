import { NextResponse } from "next/server";

import {
  googleSheetCsvUrl,
  parseGoogleSheetUrl,
} from "@/lib/customers/source-loader";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Link a (link-shared) Google Sheet as the customer import source. */
export async function POST(req: Request) {
  try {
    await requireUserId();

    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Bitte die Google-Sheet-URL angeben." },
        { status: 400 }
      );
    }

    const parsed = parseGoogleSheetUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Das sieht nicht nach einer Google-Sheet-URL aus." },
        { status: 400 }
      );
    }

    // Verify the sheet is reachable as CSV (i.e. shared "anyone with the link").
    const probe = await fetch(googleSheetCsvUrl(parsed.id, parsed.gid), {
      cache: "no-store",
      redirect: "follow",
    });
    const text = probe.ok ? await probe.text() : "";
    if (!probe.ok || text.trimStart().startsWith("<")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sheet nicht lesbar — Freigabe «Jeder mit dem Link (Betrachter)» aktivieren.",
        },
        { status: 400 }
      );
    }

    await upsertPropertySoftwareConnection("gsheet", {
      connected: true,
      connectedAt: new Date().toISOString(),
      accountLabel: "Google Sheet",
      gsheetUrl: url,
      gsheetGid: parsed.gid,
      columnMapping: null,
      lastSyncedAt: null,
      syncStatus: null,
      syncError: null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Google Sheet konnte nicht verlinkt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
