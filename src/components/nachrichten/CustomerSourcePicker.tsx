"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  CustomerDataProviderId,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";

interface SourceProviderOption {
  id: CustomerDataProviderId;
  name: string;
  connected: boolean;
  configured: boolean;
}

interface ExcelDriveItem {
  id: string;
  name: string;
  lastModifiedDateTime?: string;
}

interface CustomerSourceResponse {
  ok: boolean;
  activeProvider?: CustomerDataProviderId | null;
  providers?: SourceProviderOption[];
  excel?: {
    accountLabel: string | null;
    selected: {
      workbookId: string | null;
      workbookName: string | null;
      worksheetId: string | null;
      worksheetName: string | null;
    };
    workbooks: ExcelDriveItem[];
  } | null;
  error?: string;
}

interface PreviewWorksheet {
  id: string;
  name: string;
  dataRowCount: number;
  columnCount: number;
}

interface ExcelPreviewResponse {
  ok: boolean;
  worksheets?: PreviewWorksheet[];
  selectedWorksheetId?: string | null;
  selectedWorksheetName?: string | null;
  headers?: string[];
  sampleRows?: string[][];
  suggestedMapping?: SpreadsheetColumnMapping | null;
  reason?: string;
  error?: string;
}

const EMPTY_MAPPING: SpreadsheetColumnMapping = {
  name: -1,
  firstName: -1,
  phone: -1,
  email: -1,
  street: -1,
  zip: -1,
  city: -1,
  address: -1,
  propertyLabel: -1,
  rentalStart: -1,
  rentalEnd: -1,
  rentalInfo: -1,
};

const FIELD_DEFS: Array<{
  key: keyof SpreadsheetColumnMapping;
  label: string;
  hint?: string;
}> = [
  { key: "name", label: "Name / Mieter" },
  { key: "firstName", label: "Vorname", hint: "falls getrennt" },
  { key: "phone", label: "Telefon / Natel" },
  { key: "email", label: "E-Mail" },
  { key: "street", label: "Strasse" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "address", label: "Adresse / Liegenschaft", hint: "ganze Adresse" },
  { key: "propertyLabel", label: "Objekt / Wohnung" },
  { key: "rentalStart", label: "Mietbeginn" },
  { key: "rentalEnd", label: "Mietende" },
  { key: "rentalInfo", label: "Mietdauer / Vertrag" },
];

const PREVIEW_COLUMNS: Array<{
  label: string;
  build: (row: string[], mapping: SpreadsheetColumnMapping) => string;
}> = [
  { label: "Name", build: (row, m) => buildName(row, m) },
  { label: "Telefon", build: (row, m) => cell(row, m.phone) },
  { label: "E-Mail", build: (row, m) => cell(row, m.email) },
  { label: "Adresse", build: (row, m) => buildAddress(row, m) },
  { label: "Objekt", build: (row, m) => cell(row, m.propertyLabel) },
  { label: "Mietdauer", build: (row, m) => buildRental(row, m) },
];

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim();
}

function joinParts(...parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" ").trim();
}

function buildName(row: string[], m: SpreadsheetColumnMapping): string {
  const last = cell(row, m.name);
  const first = cell(row, m.firstName);
  return joinParts(first, last) || last || first;
}

function buildAddress(row: string[], m: SpreadsheetColumnMapping): string {
  const direct = cell(row, m.address);
  if (direct) return direct;
  return joinParts(cell(row, m.street), joinParts(cell(row, m.zip), cell(row, m.city)));
}

function buildRental(row: string[], m: SpreadsheetColumnMapping): string {
  const info = cell(row, m.rentalInfo);
  if (info) return info;
  const start = cell(row, m.rentalStart);
  const end = cell(row, m.rentalEnd);
  return joinParts(start ? `ab ${start}` : "", end ? `bis ${end}` : "");
}

function formatModified(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-CH");
}

export function CustomerSourcePicker({
  onSaved,
  onClose,
}: {
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState<CustomerDataProviderId | "">("");
  const [workbooks, setWorkbooks] = useState<ExcelDriveItem[]>([]);
  const [workbookId, setWorkbookId] = useState("");
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [excelAccountLabel, setExcelAccountLabel] = useState<string | null>(null);

  // Excel mapping review state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [worksheetOptions, setWorksheetOptions] = useState<PreviewWorksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<SpreadsheetColumnMapping>(EMPTY_MAPPING);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providers, providerId]
  );

  const inReview = providerId === "excel" && headers.length > 0;

  const loadSource = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/source");
      const data = (await res.json()) as CustomerSourceResponse;

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kundendatenquellen konnten nicht geladen werden.");
        return;
      }

      const nextProviders = data.providers ?? [];
      setProviders(nextProviders);
      setProviderId(data.activeProvider ?? "");

      const active = nextProviders.find((p) => p.id === data.activeProvider);
      if (active?.id === "excel" && data.excel?.selected.workbookName) {
        const sheet = data.excel.selected.worksheetName
          ? ` · ${data.excel.selected.worksheetName}`
          : "";
        setSavedLabel(`${active.name}: ${data.excel.selected.workbookName}${sheet}`);
      } else if (active) {
        setSavedLabel(active.name);
      } else {
        setSavedLabel(null);
      }

      if (data.excel) {
        setExcelAccountLabel(data.excel.accountLabel ?? null);
        setWorkbooks(data.excel.workbooks ?? []);
        setWorkbookId(data.excel.selected.workbookId ?? "");
      } else {
        setExcelAccountLabel(null);
        setWorkbooks([]);
        setWorkbookId("");
      }
    } catch {
      setError("Netzwerkfehler beim Laden der Kundendatenquellen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSource();
  }, [loadSource]);

  const loadPreview = useCallback(
    async (nextWorkbookId: string, nextWorksheetId?: string) => {
      if (!nextWorkbookId) return;
      setPreviewLoading(true);
      setPreviewError(null);
      setError(null);
      try {
        const params = new URLSearchParams({ workbookId: nextWorkbookId });
        if (nextWorksheetId) params.set("worksheetId", nextWorksheetId);

        const res = await fetch(
          `/api/customers/source/excel-preview?${params.toString()}`
        );
        const data = (await res.json()) as ExcelPreviewResponse;

        if (!res.ok || !data.ok) {
          setPreviewError(data.error ?? "Vorschau fehlgeschlagen.");
          setHeaders([]);
          setSampleRows([]);
          return;
        }

        setWorksheetOptions(data.worksheets ?? []);
        setWorksheetId(data.selectedWorksheetId ?? "");
        setHeaders(data.headers ?? []);
        setSampleRows(data.sampleRows ?? []);
        setMapping({ ...EMPTY_MAPPING, ...(data.suggestedMapping ?? {}) });

        if ((data.headers ?? []).length === 0 && data.reason) {
          setPreviewError(data.reason);
        }
      } catch {
        setPreviewError("Netzwerkfehler bei der Vorschau.");
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  const handleProviderChange = async (next: CustomerDataProviderId | "") => {
    setProviderId(next);
    setError(null);
    setPreviewError(null);
    setHeaders([]);
    setSampleRows([]);
    setWorksheetOptions([]);

    if (next === "excel" && workbookId) {
      await loadPreview(workbookId);
    }
  };

  const handleWorkbookChange = async (next: string) => {
    setWorkbookId(next);
    setHeaders([]);
    setSampleRows([]);
    setWorksheetOptions([]);
    if (next) await loadPreview(next);
  };

  const handleWorksheetChange = async (next: string) => {
    setWorksheetId(next);
    await loadPreview(workbookId, next);
  };

  const setFieldColumn = (
    field: keyof SpreadsheetColumnMapping,
    columnIndex: number
  ) => {
    setMapping((prev) => ({ ...prev, [field]: columnIndex }));
  };

  const mappedFieldCount = useMemo(
    () => Object.values(mapping).filter((index) => index >= 0).length,
    [mapping]
  );

  const saveSource = async () => {
    if (!providerId) {
      setError("Bitte eine Kundendatenquelle auswählen.");
      return;
    }
    if (!selectedProvider?.connected) {
      setError("Diese Quelle ist noch nicht verbunden.");
      return;
    }
    if (providerId === "excel") {
      if (!workbookId) {
        setError("Bitte eine Excel-Datei auswählen.");
        return;
      }
      if (mapping.name < 0 && mappedFieldCount === 0) {
        setError("Bitte ordnen Sie mindestens die Namens-Spalte zu.");
        return;
      }
    }

    const workbook = workbooks.find((item) => item.id === workbookId);
    const worksheet = worksheetOptions.find((item) => item.id === worksheetId);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          workbookId: providerId === "excel" ? workbookId : undefined,
          workbookName: providerId === "excel" ? workbook?.name : undefined,
          worksheetId: providerId === "excel" ? worksheetId || undefined : undefined,
          worksheetName: providerId === "excel" ? worksheet?.name : undefined,
          columnMapping: providerId === "excel" ? mapping : undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Quelle konnte nicht gespeichert werden.");
        return;
      }

      setSavedLabel(
        providerId === "excel" && workbook
          ? `${selectedProvider.name}: ${workbook.name}${
              worksheet?.name ? ` · ${worksheet.name}` : ""
            }`
          : selectedProvider.name
      );
      onSaved?.();
    } catch {
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const connectedCount = providers.filter((p) => p.connected).length;

  if (loading) {
    return (
      <div className="rounded border border-[#E1E4EA] bg-white px-3 py-3">
        <Skeleton className="mb-2 h-4 w-48" />
        <Skeleton className="h-9 w-full max-w-xl" />
      </div>
    );
  }

  return (
    <div className="rounded border border-[#E1E4EA] bg-white px-3 py-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#0E121B]">
            Kundendatenbank verwalten
          </p>
          <p className="text-[12px] text-[#525866]">
            {savedLabel
              ? `Aktiv: ${savedLabel}`
              : "Wählen Sie genau eine Quelle für Ihre Mieter- und Kundendaten."}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            title="Schliessen"
            aria-label="Schliessen"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#99A0AE] transition hover:bg-[#F5F5F5] hover:text-[#0E121B]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {connectedCount === 0 ? (
        <p className="text-[12px] text-[#525866]">
          Noch keine Quelle verbunden.{" "}
          <Link href="/integrationen" className="text-[#335cff] hover:underline">
            Integration verbinden
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-[#99A0AE]">
                System
              </span>
              <select
                value={providerId}
                onChange={(event) =>
                  void handleProviderChange(
                    event.target.value as CustomerDataProviderId | ""
                  )
                }
                className="h-9 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2 text-[13px] text-[#0E121B]"
              >
                <option value="">Quelle auswählen…</option>
                {providers.map((provider) => (
                  <option
                    key={provider.id}
                    value={provider.id}
                    disabled={!provider.connected}
                  >
                    {provider.name}
                    {provider.connected ? "" : " (nicht verbunden)"}
                  </option>
                ))}
              </select>
            </label>

            {providerId === "excel" ? (
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-[#99A0AE]">
                  Excel-Datei
                </span>
                <select
                  value={workbookId}
                  onChange={(event) => void handleWorkbookChange(event.target.value)}
                  className="h-9 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2 text-[13px] text-[#0E121B]"
                >
                  <option value="">Datei auswählen…</option>
                  {workbooks.map((workbook) => (
                    <option key={workbook.id} value={workbook.id}>
                      {workbook.name}
                      {workbook.lastModifiedDateTime
                        ? ` (${formatModified(workbook.lastModifiedDateTime)})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : providerId ? (
              <p className="pb-2 text-[12px] text-[#525866] lg:flex-1">
                Kundendaten werden direkt aus{" "}
                {selectedProvider?.name ?? "dem System"} synchronisiert.
              </p>
            ) : null}

            {providerId !== "excel" ? (
              <button
                type="button"
                onClick={() => void saveSource()}
                disabled={saving || !providerId || !selectedProvider?.connected}
                className={`${landingBtnPrimary} h-9 shrink-0 px-4 text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {saving ? "Speichert…" : "Quelle koppeln"}
              </button>
            ) : null}
          </div>

          {providerId === "excel" && workbooks.length === 0 ? (
            <p className="text-[12px] text-[#525866]">
              Keine Excel-Dateien in OneDrive gefunden
              {excelAccountLabel ? ` für ${excelAccountLabel}` : ""}. Datei muss
              als <strong>.xlsx</strong> in Ihrem persönlichen OneDrive liegen —
              prüfen Sie unter{" "}
              <a
                href="https://onedrive.live.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[#335cff] hover:underline"
              >
                onedrive.com
              </a>
              .
            </p>
          ) : null}

          {providerId === "excel" && previewLoading ? (
            <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3">
              <Skeleton className="mb-2 h-4 w-56" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {providerId === "excel" && previewError && !inReview ? (
            <p className="text-[12px] text-amber-700">{previewError}</p>
          ) : null}

          {inReview ? (
            <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-[#0E121B]">
                    Spalten zuordnen & prüfen
                  </p>
                  <p className="text-[12px] text-[#525866]">
                    Linker hat die Spalten automatisch erkannt. Bitte prüfen,
                    anpassen und bestätigen.
                  </p>
                </div>

                {worksheetOptions.length > 1 ? (
                  <label className="text-[12px] text-[#525866]">
                    Arbeitsblatt:{" "}
                    <select
                      value={worksheetId}
                      onChange={(event) =>
                        void handleWorksheetChange(event.target.value)
                      }
                      className="ml-1 h-8 rounded-md border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
                    >
                      {worksheetOptions.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          {sheet.name}
                          {sheet.dataRowCount
                            ? ` (${sheet.dataRowCount} Zeilen)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_DEFS.map((field) => (
                  <label key={field.key} className="min-w-0">
                    <span className="mb-1 block text-[11px] text-[#525866]">
                      {field.label}
                      {field.hint ? (
                        <span className="text-[#99A0AE]"> · {field.hint}</span>
                      ) : null}
                    </span>
                    <select
                      value={mapping[field.key]}
                      onChange={(event) =>
                        setFieldColumn(field.key, Number(event.target.value))
                      }
                      className="h-9 w-full rounded-md border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
                    >
                      <option value={-1}>— nicht vorhanden —</option>
                      {headers.map((header, index) => (
                        <option key={`${field.key}-${index}`} value={index}>
                          {header || `Spalte ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {sampleRows.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-[#99A0AE]">
                    Vorschau (erste {Math.min(sampleRows.length, 5)} Zeilen)
                  </p>
                  <div className="overflow-x-auto rounded border border-[#E1E4EA] bg-white">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAFAFA] text-left text-[#525866]">
                          {PREVIEW_COLUMNS.map((col) => (
                            <th
                              key={col.label}
                              className="border-b border-[#E1E4EA] px-2 py-1.5 font-medium"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="text-[#0E121B]">
                            {PREVIEW_COLUMNS.map((col) => (
                              <td
                                key={col.label}
                                className="border-b border-[#F2F2F2] px-2 py-1.5 align-top"
                              >
                                {col.build(row, mapping) || (
                                  <span className="text-[#C2C6CE]">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] text-[#525866]">
                  {mappedFieldCount} Felder zugeordnet
                </span>
                <button
                  type="button"
                  onClick={() => void saveSource()}
                  disabled={saving || mapping.name < 0}
                  className={`${landingBtnPrimary} h-9 px-4 text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {saving
                    ? "Speichert…"
                    : "Zuordnung bestätigen & synchronisieren"}
                </button>
              </div>
              {mapping.name < 0 ? (
                <p className="mt-2 text-[12px] text-amber-700">
                  Bitte mindestens die Spalte «Name / Mieter» zuordnen.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
    </div>
  );
}
