import { NextResponse, type NextRequest } from "next/server";

import { buildCraftsmanWorkbookPreview } from "@/lib/customers/craftsman-discovery";
import { inferColumnMapping } from "@/lib/customers/ai-mapping";
import { getCustomerSourceContext } from "@/lib/customers/source";
import {
  isSpreadsheetSource,
  pickBestSheet,
  scanSpreadsheetSource,
} from "@/lib/customers/source-loader";
import { isCustomerDataProvider } from "@/lib/customers/types";

export const dynamic = "force-dynamic";

/**
 * Analyse a spreadsheet source (Excel / Upload / Google Sheet): list sheets,
 * auto-pick the most customer-like one and return its headers, sample values
 * and an AI-suggested column mapping (header-name based) with per-field
 * confidence for the user to review and confirm.
 */
export async function GET(req: NextRequest) {
  try {
    const providerParam = req.nextUrl.searchParams.get("provider") ?? "excel";
    const workbookId = req.nextUrl.searchParams.get("workbookId") ?? undefined;
    const requestedSheetId = req.nextUrl.searchParams.get("sheetId") ?? undefined;

    if (!isCustomerDataProvider(providerParam) || !isSpreadsheetSource(providerParam)) {
      return NextResponse.json(
        { ok: false, error: "Diese Quelle unterstützt keine Spalten-Zuordnung." },
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

    if (provider === "excel" && !workbookId && !connection.workbookId) {
      return NextResponse.json(
        { ok: false, error: "Keine Excel-Datei angegeben." },
        { status: 400 }
      );
    }

    const sheets = await scanSpreadsheetSource(provider, connection, { workbookId });
    const worksheets = sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      dataRowCount: sheet.dataRowCount,
      columnCount: sheet.headers.length,
    }));

    const selected =
      sheets.find((sheet) => sheet.id === requestedSheetId) ?? pickBestSheet(sheets);

    const craftsmen = await buildCraftsmanWorkbookPreview({
      provider,
      sheets,
      customerSheetId: selected?.id ?? requestedSheetId ?? null,
    });

    if (!selected || selected.headers.length === 0) {
      return NextResponse.json({
        ok: true,
        worksheets,
        selectedWorksheetId: selected?.id ?? null,
        selectedWorksheetName: selected?.name ?? null,
        headers: [],
        sampleRows: [],
        suggestedMapping: null,
        confidence: {},
        craftsmen,
        reason:
          "Auf diesem Blatt wurde keine Tabelle mit Spaltenüberschriften erkannt.",
      });
    }

    const { mapping, confidence } = await inferColumnMapping(
      selected.headers,
      selected.sampleRows
    );

    return NextResponse.json({
      ok: true,
      worksheets,
      selectedWorksheetId: selected.id,
      selectedWorksheetName: selected.name,
      headers: selected.headers,
      sampleRows: selected.sampleRows,
      suggestedMapping: mapping,
      confidence,
      craftsmen,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Vorschau konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
