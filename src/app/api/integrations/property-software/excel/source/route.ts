import { NextResponse, type NextRequest } from "next/server";

import {
  excelListWorkbooks,
  excelListWorksheets,
} from "@/lib/integrations/property-software/excel";
import {
  getPropertySoftwareConnections,
  upsertPropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const connections = await getPropertySoftwareConnections();
    const connection = connections.excel;

    if (!connection?.connected) {
      return NextResponse.json(
        { ok: false, error: "Excel ist nicht verbunden." },
        { status: 404 }
      );
    }

    const workbookId =
      req.nextUrl.searchParams.get("workbookId") ?? connection.workbookId ?? undefined;

    const [workbooks, worksheets] = await Promise.all([
      excelListWorkbooks(connection),
      workbookId
        ? excelListWorksheets(connection, workbookId)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ok: true,
      selected: {
        workbookId: connection.workbookId ?? null,
        workbookName: connection.workbookName ?? null,
        worksheetId: connection.worksheetId ?? null,
        worksheetName: connection.worksheetName ?? null,
      },
      workbooks,
      worksheets,
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
        : "Excel-Quellen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const connections = await getPropertySoftwareConnections();
    const connection = connections.excel;

    if (!connection?.connected) {
      return NextResponse.json(
        { ok: false, error: "Excel ist nicht verbunden." },
        { status: 404 }
      );
    }

    const body = (await req.json()) as {
      workbookId?: string;
      workbookName?: string;
      worksheetId?: string;
      worksheetName?: string;
    };

    if (!body.workbookId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Bitte eine Excel-Datei auswählen." },
        { status: 400 }
      );
    }

    const sourceChanged =
      body.workbookId !== connection.workbookId ||
      body.worksheetId !== connection.worksheetId;

    await upsertPropertySoftwareConnection("excel", {
      workbookId: body.workbookId.trim(),
      workbookName: body.workbookName?.trim() || undefined,
      worksheetId: body.worksheetId?.trim() || undefined,
      worksheetName: body.worksheetName?.trim() || undefined,
      ...(sourceChanged ? { columnMapping: null, lastSyncedAt: null } : {}),
    });

    return NextResponse.json({ ok: true });
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
        : "Excel-Quelle konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
