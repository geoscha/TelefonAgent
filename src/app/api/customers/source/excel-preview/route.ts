import { NextResponse, type NextRequest } from "next/server";

import { inferColumnMapping, heuristicColumnMapping } from "@/lib/customers/ai-mapping";
import { getCustomerSourceContext } from "@/lib/customers/source";
import {
  excelScanWorkbook,
  scoreSheetForCustomers,
} from "@/lib/integrations/property-software/excel";

export const dynamic = "force-dynamic";

/**
 * Analyse a workbook: list all worksheets, auto-detect the sheet most likely
 * to hold customer data, and return its headers, sample rows and a suggested
 * (AI-assisted) column mapping for the user to review and confirm.
 */
export async function GET(req: NextRequest) {
  try {
    const workbookId = req.nextUrl.searchParams.get("workbookId");
    const requestedSheetId = req.nextUrl.searchParams.get("worksheetId");

    if (!workbookId) {
      return NextResponse.json(
        { ok: false, error: "Keine Excel-Datei angegeben." },
        { status: 400 }
      );
    }

    const { connections } = await getCustomerSourceContext();
    const connection = connections.excel;
    if (!connection?.connected) {
      return NextResponse.json(
        { ok: false, error: "Excel ist nicht verbunden." },
        { status: 400 }
      );
    }

    const scans = await excelScanWorkbook(connection, workbookId);

    const worksheets = scans.map((scan) => ({
      id: scan.id,
      name: scan.name,
      dataRowCount: scan.dataRowCount,
      columnCount: scan.headers.length,
      score: scoreSheetForCustomers(scan),
    }));

    // Pick requested sheet, else the best-scoring one with data.
    const ranked = [...scans].sort(
      (a, b) => scoreSheetForCustomers(b) - scoreSheetForCustomers(a)
    );
    const selected =
      scans.find((s) => s.id === requestedSheetId) ?? ranked[0] ?? null;

    if (!selected || selected.headers.length === 0) {
      return NextResponse.json({
        ok: true,
        worksheets,
        selectedWorksheetId: selected?.id ?? null,
        selectedWorksheetName: selected?.name ?? null,
        headers: [],
        sampleRows: [],
        suggestedMapping: null,
        reason:
          "Auf diesem Blatt wurde keine Tabelle mit Spaltenüberschriften erkannt.",
      });
    }

    let suggestedMapping = heuristicColumnMapping(selected.headers);
    try {
      suggestedMapping = await inferColumnMapping(
        selected.headers,
        selected.sampleRows
      );
    } catch {
      // heuristic fallback already assigned
    }

    return NextResponse.json({
      ok: true,
      worksheets,
      selectedWorksheetId: selected.id,
      selectedWorksheetName: selected.name,
      headers: selected.headers,
      sampleRows: selected.sampleRows,
      suggestedMapping,
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
        : "Excel-Vorschau konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
