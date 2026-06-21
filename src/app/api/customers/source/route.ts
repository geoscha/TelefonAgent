import { NextResponse, type NextRequest } from "next/server";

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
import { isCustomerDataProvider } from "@/lib/customers/types";
import { EMPTY_COLUMN_MAPPING } from "@/lib/customers/ai-mapping";
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

    const excel =
      excelConnection?.connected
        ? {
            accountLabel: excelConnection.accountLabel ?? null,
            selected: {
              workbookId: excelConnection.workbookId ?? null,
              workbookName: excelConnection.workbookName ?? null,
              worksheetId: excelConnection.worksheetId ?? null,
              worksheetName: excelConnection.worksheetName ?? null,
            },
            workbooks: await excelListWorkbooks(excelConnection),
            worksheets: workbookId
              ? await excelListWorksheets(excelConnection, workbookId)
              : [],
          }
        : null;

    return NextResponse.json({
      ok: true,
      activeProvider: activeProvider ?? null,
      providers,
      excel,
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider?: string;
      workbookId?: string;
      workbookName?: string;
      worksheetId?: string;
      worksheetName?: string;
      columnMapping?: Partial<SpreadsheetColumnMapping>;
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

    if (provider === "excel") {
      if (!body.workbookId?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Bitte eine Excel-Datei auswählen." },
          { status: 400 }
        );
      }

      // A confirmed column mapping is required so we know which columns hold
      // name, phone, address etc. — the user reviews/approves it in the UI.
      const mapping: SpreadsheetColumnMapping = {
        ...EMPTY_COLUMN_MAPPING,
        ...(body.columnMapping ?? {}),
      };
      const hasMapping = Object.values(mapping).some((index) => index >= 0);
      if (!hasMapping) {
        return NextResponse.json(
          {
            ok: false,
            error: "Bitte ordnen Sie mindestens eine Spalte zu (z. B. Name).",
          },
          { status: 400 }
        );
      }

      await upsertPropertySoftwareConnection("excel", {
        workbookId: body.workbookId.trim(),
        workbookName: body.workbookName?.trim() || undefined,
        worksheetId: body.worksheetId?.trim() || undefined,
        worksheetName: body.worksheetName?.trim() || undefined,
        columnMapping: mapping,
        lastSyncedAt: null,
      });
    }

    await setActiveCustomerDataProvider(provider);
    await clearCustomerRecordsExcept(provider);
    await syncActiveCustomerSource({ force: true });

    return NextResponse.json({ ok: true, activeProvider: provider });
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
