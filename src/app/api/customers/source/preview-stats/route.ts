import { NextResponse } from "next/server";

import { getCustomerSourceContext } from "@/lib/customers/source";
import {
  isSpreadsheetSource,
  loadSpreadsheetRows,
} from "@/lib/customers/source-loader";
import { buildMappingReport, resolveColumnMapping } from "@/lib/customers/normalize";
import { isCustomerDataProvider } from "@/lib/customers/types";

export const dynamic = "force-dynamic";

/**
 * Compute pre-save preview stats (valid rows, normalizable phones, problem
 * rows) for the current mapping against the FULL source dataset — using the
 * exact same normalization (incl. libphonenumber E.164) as the real sync.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider?: string;
      workbookId?: string;
      sheetId?: string;
      mapping?: Record<string, unknown>;
    };

    const providerParam = body.provider ?? "";
    if (!isCustomerDataProvider(providerParam) || !isSpreadsheetSource(providerParam)) {
      return NextResponse.json(
        { ok: false, error: "Diese Quelle unterstützt keine Vorschau." },
        { status: 400 }
      );
    }
    const provider = providerParam;

    const { connections } = await getCustomerSourceContext();
    const connection = connections[provider];
    if (!connection?.connected) {
      return NextResponse.json(
        { ok: false, error: "Quelle ist nicht verbunden." },
        { status: 400 }
      );
    }

    const rows = await loadSpreadsheetRows(provider, connection, {
      workbookId: body.workbookId,
      sheetId: body.sheetId,
    });
    if (rows.length < 2) {
      return NextResponse.json({
        ok: true,
        stats: {
          totalRows: 0,
          validRows: 0,
          normalizablePhones: 0,
          unmatchedPhones: 0,
          problems: [],
        },
      });
    }

    const mapping = resolveColumnMapping(body.mapping, rows[0] ?? []);
    const { stats } = buildMappingReport(provider, rows, mapping);

    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Vorschau fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
