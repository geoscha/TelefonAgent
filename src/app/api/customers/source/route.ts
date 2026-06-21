import { NextResponse, type NextRequest } from "next/server";

import { EMPTY_COLUMN_MAPPING } from "@/lib/customers/normalize";
import {
  getCustomerSourceContext,
  listCustomerSourceProviders,
  setActiveCustomerDataProvider,
} from "@/lib/customers/source";
import { clearCustomerRecordsExcept } from "@/lib/customers/store";
import { syncActiveCustomerSource } from "@/lib/customers/sync";
import type {
  CustomerDataProviderId,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";
import { isCustomerDataProvider, isSpreadsheetProvider } from "@/lib/customers/types";
import {
  excelListWorkbooks,
  excelListWorksheets,
} from "@/lib/integrations/property-software/excel";
import { PROPERTY_SOFTWARE_PROVIDER_META } from "@/lib/integrations/property-software/provider-meta";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { activeProvider, connections } = await getCustomerSourceContext();
    const providers = listCustomerSourceProviders(connections).map((entry) => ({
      ...entry,
      name: PROPERTY_SOFTWARE_PROVIDER_META[entry.id].name,
    }));

    const excelConnection = connections.excel;
    const workbookId =
      req.nextUrl.searchParams.get("workbookId") ??
      excelConnection?.workbookId ??
      undefined;

    const includeExcelFiles =
      req.nextUrl.searchParams.get("includeExcelFiles") === "1";

    const excel = excelConnection?.connected
      ? {
          accountLabel: excelConnection.accountLabel ?? null,
          selected: {
            workbookId: excelConnection.workbookId ?? null,
            workbookName: excelConnection.workbookName ?? null,
            worksheetId: excelConnection.worksheetId ?? null,
            worksheetName: excelConnection.worksheetName ?? null,
          },
          columnMapping: excelConnection.columnMapping ?? null,
          workbooks: includeExcelFiles
            ? await excelListWorkbooks(excelConnection)
            : [],
          worksheets:
            includeExcelFiles && workbookId
              ? await excelListWorksheets(excelConnection, workbookId)
              : [],
        }
      : null;

    const uploadConnection = connections.upload;
    const upload = uploadConnection?.fileRef
      ? {
          fileName: uploadConnection.fileName ?? null,
          worksheetId: uploadConnection.worksheetId ?? null,
          columnMapping: uploadConnection.columnMapping ?? null,
        }
      : null;

    const gsheetConnection = connections.gsheet;
    const gsheet = gsheetConnection?.gsheetUrl
      ? {
          url: gsheetConnection.gsheetUrl,
          columnMapping: gsheetConnection.columnMapping ?? null,
        }
      : null;

    const activeStatus = activeProvider
      ? {
          syncStatus: connections[activeProvider]?.syncStatus ?? null,
          syncError: connections[activeProvider]?.syncError ?? null,
        }
      : null;

    return NextResponse.json({
      ok: true,
      activeProvider: activeProvider ?? null,
      providers,
      excel,
      upload,
      gsheet,
      activeStatus,
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
        : "Kundendatenquelle konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

function mappingHasName(mapping: SpreadsheetColumnMapping): boolean {
  return Boolean(mapping.name && mapping.name.trim());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider?: string;
      workbookId?: string;
      workbookName?: string;
      worksheetId?: string;
      worksheetName?: string;
      sheetId?: string;
      sheetName?: string;
      columnMapping?: Partial<SpreadsheetColumnMapping>;
      craftsmanWorksheetId?: string | null;
      craftsmanWorksheetName?: string | null;
      craftsmanColumnMapping?: Partial<SpreadsheetColumnMapping>;
    };

    if (!body.provider || !isCustomerDataProvider(body.provider)) {
      return NextResponse.json(
        { ok: false, error: "Bitte eine gültige Kundendatenquelle wählen." },
        { status: 400 }
      );
    }

    const provider = body.provider as CustomerDataProviderId;
    const { connections } = await getCustomerSourceContext();
    const connection = connections[provider];

    if (!connection?.connected) {
      return NextResponse.json(
        {
          ok: false,
          error: `${PROPERTY_SOFTWARE_PROVIDER_META[provider].name} ist nicht verbunden.`,
        },
        { status: 400 }
      );
    }

    if (isSpreadsheetProvider(provider)) {
      // Confirmed, header-name column mapping (name column required).
      const mapping: SpreadsheetColumnMapping = {
        ...EMPTY_COLUMN_MAPPING,
        ...(body.columnMapping ?? {}),
      };
      if (!mappingHasName(mapping)) {
        return NextResponse.json(
          { ok: false, error: "Bitte ordnen Sie mindestens die Namens-Spalte zu." },
          { status: 400 }
        );
      }

      const craftsmanMapping: SpreadsheetColumnMapping | undefined =
        body.craftsmanColumnMapping && mappingHasName({
          ...EMPTY_COLUMN_MAPPING,
          ...body.craftsmanColumnMapping,
        })
          ? { ...EMPTY_COLUMN_MAPPING, ...body.craftsmanColumnMapping }
          : undefined;

      const craftsmanPatch = {
        craftsmanWorksheetId:
          body.craftsmanWorksheetId === null
            ? null
            : body.craftsmanWorksheetId?.trim() || null,
        craftsmanWorksheetName: body.craftsmanWorksheetName?.trim() || null,
        craftsmanColumnMapping: craftsmanMapping ?? null,
      };

      if (provider === "excel") {
        if (!body.workbookId?.trim()) {
          return NextResponse.json(
            { ok: false, error: "Bitte eine Excel-Datei auswählen." },
            { status: 400 }
          );
        }
        await upsertPropertySoftwareConnection("excel", {
          workbookId: body.workbookId.trim(),
          workbookName: body.workbookName?.trim() || undefined,
          worksheetId: body.worksheetId?.trim() || undefined,
          worksheetName: body.worksheetName?.trim() || undefined,
          columnMapping: mapping,
          ...craftsmanPatch,
          lastSyncedAt: null,
          syncStatus: null,
          syncError: null,
        });
      } else if (provider === "upload") {
        if (!connection.fileRef) {
          return NextResponse.json(
            { ok: false, error: "Bitte zuerst eine Datei hochladen." },
            { status: 400 }
          );
        }
        await upsertPropertySoftwareConnection("upload", {
          worksheetId: body.sheetId?.trim() || undefined,
          worksheetName: body.sheetName?.trim() || undefined,
          columnMapping: mapping,
          ...craftsmanPatch,
          lastSyncedAt: null,
          syncStatus: null,
          syncError: null,
        });
      } else if (provider === "gsheet") {
        if (!connection.gsheetUrl) {
          return NextResponse.json(
            { ok: false, error: "Bitte zuerst ein Google Sheet verlinken." },
            { status: 400 }
          );
        }
        await upsertPropertySoftwareConnection("gsheet", {
          columnMapping: mapping,
          ...craftsmanPatch,
          lastSyncedAt: null,
          syncStatus: null,
          syncError: null,
        });
      }
    }

    await setActiveCustomerDataProvider(provider);
    await clearCustomerRecordsExcept(provider);
    const result = await syncActiveCustomerSource({ force: true });

    return NextResponse.json({
      ok: true,
      activeProvider: provider,
      synced: result?.records ?? 0,
      error: result?.error ?? null,
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
        : "Kundendatenquelle konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
