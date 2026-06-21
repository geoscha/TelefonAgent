"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { CACHE_KEYS, readCached, writeStaleCache } from "@/lib/client/stale-cache";
import type {
  ColumnMappingConfidence,
  CustomerDataProviderId,
  MappingPreviewStats,
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
    columnMapping?: SpreadsheetColumnMapping | null;
    workbooks: ExcelDriveItem[];
  } | null;
  upload?: { fileName: string | null; worksheetId: string | null; columnMapping?: SpreadsheetColumnMapping | null } | null;
  gsheet?: { url: string; columnMapping?: SpreadsheetColumnMapping | null } | null;
  error?: string;
}

interface PreviewWorksheet {
  id: string;
  name: string;
  dataRowCount: number;
  columnCount: number;
}

interface CraftsmanPreviewRecord {
  name: string;
  trade?: string;
  phone?: string;
  email?: string;
  sheetName?: string;
}

interface CraftsmanWorkbookPreview {
  sheets: Array<{ id: string; name: string; score: number; dataRowCount: number }>;
  totalCount: number;
  primarySheetId: string | null;
  primarySheetName: string | null;
  suggestedMapping: SpreadsheetColumnMapping | null;
  confidence: ColumnMappingConfidence;
  previewRecords: CraftsmanPreviewRecord[];
}

interface PreviewResponse {
  ok: boolean;
  worksheets?: PreviewWorksheet[];
  selectedWorksheetId?: string | null;
  selectedWorksheetName?: string | null;
  headers?: string[];
  sampleRows?: string[][];
  suggestedMapping?: SpreadsheetColumnMapping | null;
  confidence?: ColumnMappingConfidence;
  craftsmen?: CraftsmanWorkbookPreview | null;
  reason?: string;
  error?: string;
}

const EMPTY_MAPPING: SpreadsheetColumnMapping = {
  name: "",
  firstName: "",
  phone: "",
  email: "",
  street: "",
  zip: "",
  city: "",
  address: "",
  propertyLabel: "",
  unit: "",
  rentalStart: "",
  rentalEnd: "",
  rentalInfo: "",
  trade: "",
};

const FIELD_DEFS: Array<{
  key: keyof SpreadsheetColumnMapping;
  label: string;
  hint?: string;
  required?: boolean;
}> = [
  { key: "name", label: "Name / Mieter", required: true },
  { key: "firstName", label: "Vorname", hint: "falls getrennt" },
  { key: "phone", label: "Telefon / Natel" },
  { key: "email", label: "E-Mail" },
  { key: "street", label: "Strasse" },
  { key: "zip", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "address", label: "Adresse", hint: "ganze Adresse" },
  { key: "propertyLabel", label: "Liegenschaft" },
  { key: "trade", label: "Gewerk", hint: "Handwerker-Listen" },
  { key: "unit", label: "Wohnung / Objekt" },
  { key: "rentalStart", label: "Mietbeginn" },
  { key: "rentalEnd", label: "Mietende" },
  { key: "rentalInfo", label: "Vertrag / Mietdauer" },
];

const LOW_CONFIDENCE = 0.6;

function coerceSpreadsheetMapping(
  mapping?: Partial<SpreadsheetColumnMapping> | Record<string, unknown> | null
): SpreadsheetColumnMapping {
  const out: SpreadsheetColumnMapping = { ...EMPTY_MAPPING };
  if (!mapping) return out;
  for (const field of Object.keys(EMPTY_MAPPING) as Array<keyof SpreadsheetColumnMapping>) {
    const value = (mapping as Record<string, unknown>)[field];
    if (typeof value === "string") {
      out[field] = value.trim();
    }
  }
  return out;
}

function mappingNameFilled(mapping: SpreadsheetColumnMapping): boolean {
  return String(mapping.name ?? "").trim().length > 0;
}

function formatModified(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-CH");
}

function headersFromMapping(mapping: SpreadsheetColumnMapping): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const header of Object.values(mapping)) {
    const trimmed = String(header ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headers.push(trimmed);
  }
  return headers;
}

function savedMappingForProvider(
  provider: CustomerDataProviderId | "" | null | undefined,
  data: CustomerSourceResponse
): SpreadsheetColumnMapping | null {
  if (!provider) return null;
  if (provider === "excel") return data.excel?.columnMapping ?? null;
  if (provider === "upload") return data.upload?.columnMapping ?? null;
  if (provider === "gsheet") return data.gsheet?.columnMapping ?? null;
  return null;
}

export function CustomerSourcePicker({
  onSaved,
  onClose,
  initialActiveProvider,
}: {
  onSaved?: () => void;
  onClose?: () => void;
  initialActiveProvider?: CustomerDataProviderId | null;
}) {
  const [loading, setLoading] = useState(() => !readCached(CACHE_KEYS.customerSource));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState<CustomerDataProviderId | "">("");
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  // Excel
  const [workbooks, setWorkbooks] = useState<ExcelDriveItem[]>([]);
  const [workbooksLoading, setWorkbooksLoading] = useState(false);
  const [workbookId, setWorkbookId] = useState("");
  const [workbookName, setWorkbookName] = useState<string | null>(null);
  const [excelAccountLabel, setExcelAccountLabel] = useState<string | null>(null);

  // Upload
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Sheet
  const [gsheetUrlInput, setGsheetUrlInput] = useState("");
  const [gsheetLinked, setGsheetLinked] = useState(false);
  const [linking, setLinking] = useState(false);

  // Mapping review
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [worksheetOptions, setWorksheetOptions] = useState<PreviewWorksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<SpreadsheetColumnMapping>(EMPTY_MAPPING);
  const [confidence, setConfidence] = useState<ColumnMappingConfidence>({});

  // Pre-save stats
  const [stats, setStats] = useState<MappingPreviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [craftsmenPreview, setCraftsmenPreview] = useState<CraftsmanWorkbookPreview | null>(
    null
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providers, providerId]
  );

  const isSpreadsheet =
    providerId === "excel" || providerId === "upload" || providerId === "gsheet";
  const inReview =
    isSpreadsheet &&
    (headers.length > 0 || mappingNameFilled(mapping) || previewLoading);

  const headerIndex = useMemo(() => {
    const map = new Map<string, number>();
    headers.forEach((header, index) => {
      const key = String(header ?? "").trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, index);
    });
    return map;
  }, [headers]);

  const cellByHeader = useCallback(
    (row: string[], header: string): string => {
      const key = String(header ?? "").trim().toLowerCase();
      if (!key) return "";
      const idx = headerIndex.get(key);
      if (idx == null) return "";
      return String(row[idx] ?? "").trim();
    },
    [headerIndex]
  );

  const applySourceData = useCallback((data: CustomerSourceResponse) => {
    const nextProviders = data.providers ?? [];
    setProviders(nextProviders);
    const active = data.activeProvider ?? initialActiveProvider ?? "";
    setProviderId(active);

    const activeProvider = nextProviders.find((p) => p.id === active);
    setSavedLabel(activeProvider ? activeProvider.name : null);

    setExcelAccountLabel(data.excel?.accountLabel ?? null);
    setWorkbooks(data.excel?.workbooks ?? []);
    setWorkbookId(data.excel?.selected.workbookId ?? "");
    setWorkbookName(data.excel?.selected.workbookName ?? null);
    setUploadFileName(data.upload?.fileName ?? null);
    setGsheetLinked(Boolean(data.gsheet?.url));
    setGsheetUrlInput(data.gsheet?.url ?? "");

    const savedMapping = savedMappingForProvider(active, data);
    if (savedMapping) {
      const nextMapping = coerceSpreadsheetMapping(savedMapping);
      setMapping(nextMapping);
      setHeaders(headersFromMapping(nextMapping));
    }
  }, [initialActiveProvider]);

  const loadExcelWorkbooks = useCallback(async () => {
    setWorkbooksLoading(true);
    try {
      const res = await fetch("/api/customers/source?includeExcelFiles=1");
      const data = (await res.json()) as CustomerSourceResponse;
      if (!res.ok || !data.ok) return;
      setWorkbooks(data.excel?.workbooks ?? []);
      writeStaleCache(CACHE_KEYS.customerSource, {
        ...(readCached<CustomerSourceResponse>(CACHE_KEYS.customerSource) ?? {}),
        ...data,
      });
    } catch {
      /* keep current selection visible */
    } finally {
      setWorkbooksLoading(false);
    }
  }, []);

  const loadSource = useCallback(async () => {
    const cached = readCached<CustomerSourceResponse>(CACHE_KEYS.customerSource);
    if (cached?.ok) {
      applySourceData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/customers/source");
      const data = (await res.json()) as CustomerSourceResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kundendatenquellen konnten nicht geladen werden.");
        return;
      }

      applySourceData(data);
      writeStaleCache(CACHE_KEYS.customerSource, data);

      const active = data.activeProvider ?? initialActiveProvider ?? null;
      if (active === "excel") {
        void loadExcelWorkbooks();
      }
    } catch {
      if (!cached?.ok) {
        setError("Netzwerkfehler beim Laden der Kundendatenquellen.");
      }
    } finally {
      setLoading(false);
    }
  }, [applySourceData, initialActiveProvider, loadExcelWorkbooks]);

  useEffect(() => {
    void loadSource();
  }, [loadSource]);

  const resetReview = () => {
    setHeaders([]);
    setSampleRows([]);
    setWorksheetOptions([]);
    setMapping(EMPTY_MAPPING);
    setConfidence({});
    setStats(null);
    setCraftsmenPreview(null);
    setPreviewError(null);
  };

  const loadPreview = useCallback(
    async (
      provider: CustomerDataProviderId,
      opts?: { workbookId?: string; sheetId?: string }
    ) => {
      setPreviewLoading(true);
      setPreviewError(null);
      setError(null);
      try {
        const params = new URLSearchParams({ provider });
        if (opts?.workbookId) params.set("workbookId", opts.workbookId);
        if (opts?.sheetId) params.set("sheetId", opts.sheetId);

        const res = await fetch(`/api/customers/source/preview?${params.toString()}`);
        const data = (await res.json()) as PreviewResponse;

        if (!res.ok || !data.ok) {
          setPreviewError(data.error ?? "Vorschau fehlgeschlagen.");
          setHeaders([]);
          setSampleRows([]);
          setCraftsmenPreview(null);
          return;
        }

        setWorksheetOptions(data.worksheets ?? []);
        setWorksheetId(data.selectedWorksheetId ?? "");
        setHeaders(data.headers ?? []);
        setSampleRows(data.sampleRows ?? []);
        setMapping((prev) => {
          const suggested = coerceSpreadsheetMapping(data.suggestedMapping ?? {});
          if (mappingNameFilled(prev)) {
            return { ...suggested, ...prev };
          }
          return suggested;
        });
        setConfidence(data.confidence ?? {});
        setCraftsmenPreview(data.craftsmen ?? null);

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

  useEffect(() => {
    if (loading || !providerId || !isSpreadsheet) return;
    if (providerId === "excel" && workbookId) {
      void loadPreview("excel", { workbookId });
    } else if (providerId === "upload" && uploadFileName) {
      void loadPreview("upload");
    } else if (providerId === "gsheet" && gsheetLinked) {
      void loadPreview("gsheet");
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps -- once after config load

  const handleProviderChange = async (next: CustomerDataProviderId | "") => {
    setProviderId(next);
    setError(null);
    resetReview();

    if (next === "excel") {
      if (workbooks.length === 0) void loadExcelWorkbooks();
      if (workbookId) await loadPreview("excel", { workbookId });
    } else if (next === "upload" && uploadFileName) {
      await loadPreview("upload");
    } else if (next === "gsheet" && gsheetLinked) {
      await loadPreview("gsheet");
    }
  };

  const handleWorkbookChange = async (next: string) => {
    setWorkbookId(next);
    const selected = workbooks.find((workbook) => workbook.id === next);
    setWorkbookName(selected?.name ?? null);
    resetReview();
    if (next) await loadPreview("excel", { workbookId: next });
  };

  const handleWorksheetChange = async (next: string) => {
    setWorksheetId(next);
    if (!providerId || !isSpreadsheet) return;
    await loadPreview(providerId, {
      workbookId: providerId === "excel" ? workbookId : undefined,
      sheetId: next,
    });
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    resetReview();
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/customers/source/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok: boolean; fileName?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setUploadFileName(data.fileName ?? file.name);
      setProviders((prev) =>
        prev.map((p) => (p.id === "upload" ? { ...p, configured: true } : p))
      );
      await loadPreview("upload");
    } catch {
      setError("Netzwerkfehler beim Upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleGsheetLink = async () => {
    const url = gsheetUrlInput.trim();
    if (!url) {
      setError("Bitte die Google-Sheet-URL angeben.");
      return;
    }
    setLinking(true);
    setError(null);
    resetReview();
    try {
      const res = await fetch("/api/customers/source/gsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Google Sheet konnte nicht verlinkt werden.");
        return;
      }
      setGsheetLinked(true);
      setProviders((prev) =>
        prev.map((p) => (p.id === "gsheet" ? { ...p, configured: true } : p))
      );
      await loadPreview("gsheet");
    } catch {
      setError("Netzwerkfehler beim Verlinken.");
    } finally {
      setLinking(false);
    }
  };

  const setFieldColumn = (field: keyof SpreadsheetColumnMapping, header: string) => {
    setMapping((prev) => ({ ...prev, [field]: header }));
    // Manual override → drop the AI confidence marker for that field.
    setConfidence((prev) => {
      if (prev[field] == null) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const mappedFieldCount = useMemo(
    () =>
      Object.values(mapping).filter(
        (header) => String(header ?? "").trim().length > 0
      ).length,
    [mapping]
  );

  // Recompute pre-save stats (full dataset, server-side E.164) on mapping change.
  useEffect(() => {
    if (!inReview || !providerId || !mappingNameFilled(mapping)) {
      setStats(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setStatsLoading(true);
      try {
        const res = await fetch("/api/customers/source/preview-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: providerId,
            workbookId: providerId === "excel" ? workbookId : undefined,
            sheetId: worksheetId || undefined,
            mapping,
          }),
        });
        const data = (await res.json()) as { ok: boolean; stats?: MappingPreviewStats };
        if (!cancelled && res.ok && data.ok && data.stats) setStats(data.stats);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [inReview, providerId, mapping, workbookId, worksheetId]);

  const saveSource = async () => {
    if (!providerId) {
      setError("Bitte eine Kundendatenquelle auswählen.");
      return;
    }
    if (!selectedProvider?.connected) {
      setError("Diese Quelle ist noch nicht verbunden.");
      return;
    }
    if (isSpreadsheet && !mappingNameFilled(mapping)) {
      setError("Bitte mindestens die Spalte «Name / Mieter» zuordnen.");
      return;
    }
    if (providerId === "excel" && !workbookId) {
      setError("Bitte eine Excel-Datei auswählen.");
      return;
    }

    const workbook = workbooks.find((item) => item.id === workbookId);
    const worksheet = worksheetOptions.find((item) => item.id === worksheetId);

    setSaving(true);
    setError(null);
    try {
      const useMultiSheetCraftsmen =
        craftsmenPreview != null && craftsmenPreview.sheets.length > 1;
      const res = await fetch("/api/customers/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          workbookId: providerId === "excel" ? workbookId : undefined,
          workbookName: providerId === "excel" ? workbook?.name : undefined,
          worksheetId: providerId === "excel" ? worksheetId || undefined : undefined,
          worksheetName: providerId === "excel" ? worksheet?.name : undefined,
          sheetId: providerId !== "excel" ? worksheetId || undefined : undefined,
          sheetName: providerId !== "excel" ? worksheet?.name : undefined,
          columnMapping: isSpreadsheet ? mapping : undefined,
          craftsmanWorksheetId: craftsmenPreview
            ? useMultiSheetCraftsmen
              ? null
              : craftsmenPreview.primarySheetId
            : undefined,
          craftsmanWorksheetName: craftsmenPreview?.primarySheetName ?? undefined,
          craftsmanColumnMapping: craftsmenPreview?.suggestedMapping ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Quelle konnte nicht gespeichert werden.");
        return;
      }
      setSavedLabel(selectedProvider.name);
      onSaved?.();
    } catch {
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const connectedCount = providers.filter((p) => p.connected).length;

  return (
    <div className="rounded border border-[#E1E4EA] bg-white px-3 py-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#0E121B]">
            Datenquelle verwalten
          </p>
          <p className="text-[12px] text-[#525866]">
            {savedLabel
              ? `Aktiv: ${savedLabel}`
              : "Wählen Sie genau eine Quelle für Mieter- und Handwerkerdaten."}
            {loading ? " · aktualisiere…" : null}
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

      {connectedCount === 0 && !loading ? (
        <p className="text-[12px] text-[#525866]">
          Keine Quelle verfügbar.{" "}
          <Link href="/integrationen" className="text-[#335cff] hover:underline">
            Integration verbinden
          </Link>
        </p>
      ) : loading && providers.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-9 w-full max-w-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-[#99A0AE]">
                Quelle
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
                  disabled={workbooksLoading && workbooks.length === 0}
                  className="h-9 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2 text-[13px] text-[#0E121B] disabled:opacity-70"
                >
                  <option value="">
                    {workbooksLoading ? "Excel-Dateien laden…" : "Datei auswählen…"}
                  </option>
                  {workbookId &&
                  !workbooks.some((workbook) => workbook.id === workbookId) ? (
                    <option value={workbookId}>
                      {workbookName ?? "Aktuelle Datei"}
                    </option>
                  ) : null}
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
            ) : null}

            {providerId && !isSpreadsheet ? (
              <button
                type="button"
                onClick={() => void saveSource()}
                disabled={saving || !selectedProvider?.connected}
                className={`${landingBtnPrimary} h-9 shrink-0 px-4 text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {saving ? "Speichert…" : "Quelle koppeln"}
              </button>
            ) : null}
          </div>

          {providerId === "upload" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFileUpload(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-3 text-[12px] text-[#0E121B] hover:bg-[#F5F5F5] disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Lädt hoch…" : "Datei wählen (.xlsx/.csv)"}
              </button>
              {uploadFileName ? (
                <span className="text-[12px] text-[#525866]">{uploadFileName}</span>
              ) : null}
            </div>
          ) : null}

          {providerId === "gsheet" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-[#99A0AE]">
                  Google-Sheet-URL (Freigabe «Jeder mit dem Link»)
                </span>
                <input
                  type="url"
                  value={gsheetUrlInput}
                  onChange={(event) => setGsheetUrlInput(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="h-9 w-full rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-2 text-[13px] text-[#0E121B]"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleGsheetLink()}
                disabled={linking}
                className="inline-flex h-9 items-center rounded-md border border-[#E1E4EA] bg-[#FAFAFA] px-3 text-[12px] text-[#0E121B] hover:bg-[#F5F5F5] disabled:opacity-60"
              >
                {linking ? "Prüft…" : gsheetLinked ? "Neu prüfen" : "Verlinken"}
              </button>
            </div>
          ) : null}

          {providerId === "excel" && workbooksLoading ? (
            <p className="text-[12px] text-[#99A0AE]">
              Excel-Dateien werden im Hintergrund geladen…
            </p>
          ) : null}

          {providerId === "excel" &&
          !workbooksLoading &&
          workbooks.length === 0 &&
          !workbookId ? (
            <p className="text-[12px] text-[#525866]">
              Keine Excel-Dateien in OneDrive gefunden
              {excelAccountLabel ? ` für ${excelAccountLabel}` : ""}.
            </p>
          ) : null}

          {isSpreadsheet && previewLoading ? (
            <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3">
              <Skeleton className="mb-2 h-4 w-56" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {isSpreadsheet && previewError && !inReview ? (
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
                    Linker hat die Spalten automatisch vorgeschlagen. Felder mit{" "}
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" />{" "}
                    bitte prüfen.
                  </p>
                </div>

                {worksheetOptions.length > 1 ? (
                  <label className="text-[12px] text-[#525866]">
                    Tabelle:{" "}
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
                          {sheet.dataRowCount ? ` (${sheet.dataRowCount} Zeilen)` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_DEFS.map((field) => {
                  const conf = confidence[field.key];
                  const lowConf = conf != null && conf < LOW_CONFIDENCE;
                  return (
                    <label key={field.key} className="min-w-0">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-[#525866]">
                        {lowConf ? (
                          <span
                            title="Unsicherer Vorschlag — bitte prüfen"
                            className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400"
                          />
                        ) : conf != null ? (
                          <span
                            title="Automatisch erkannt"
                            className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                          />
                        ) : null}
                        {field.label}
                        {field.required ? (
                          <span className="text-red-500">*</span>
                        ) : null}
                        {field.hint ? (
                          <span className="text-[#99A0AE]"> · {field.hint}</span>
                        ) : null}
                      </span>
                      <select
                        value={mapping[field.key]}
                        onChange={(event) =>
                          setFieldColumn(field.key, event.target.value)
                        }
                        className={`h-9 w-full rounded-md border bg-white px-2 text-[13px] text-[#0E121B] ${
                          lowConf ? "border-amber-300" : "border-[#E1E4EA]"
                        }`}
                      >
                        <option value="">— nicht vorhanden —</option>
                        {headers.map((header, index) => (
                          <option key={`${field.key}-${index}`} value={header}>
                            {header || `Spalte ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
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
                          {["Name", "Telefon", "E-Mail", "Adresse", "Objekt"].map(
                            (col) => (
                              <th
                                key={col}
                                className="border-b border-[#E1E4EA] px-2 py-1.5 font-medium"
                              >
                                {col}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.slice(0, 5).map((row, rowIndex) => {
                          const name =
                            [
                              cellByHeader(row, mapping.firstName),
                              cellByHeader(row, mapping.name),
                            ]
                              .filter(Boolean)
                              .join(" ") || cellByHeader(row, mapping.name);
                          const address =
                            cellByHeader(row, mapping.address) ||
                            [
                              cellByHeader(row, mapping.street),
                              cellByHeader(row, mapping.zip),
                              cellByHeader(row, mapping.city),
                            ]
                              .filter(Boolean)
                              .join(" ");
                          const obj =
                            [
                              cellByHeader(row, mapping.propertyLabel),
                              cellByHeader(row, mapping.unit),
                            ]
                              .filter(Boolean)
                              .join(" · ");
                          const values = [
                            name,
                            cellByHeader(row, mapping.phone),
                            cellByHeader(row, mapping.email),
                            address,
                            obj,
                          ];
                          return (
                            <tr key={rowIndex} className="text-[#0E121B]">
                              {values.map((value, colIndex) => (
                                <td
                                  key={colIndex}
                                  className="border-b border-[#F2F2F2] px-2 py-1.5 align-top"
                                >
                                  {value || <span className="text-[#C2C6CE]">—</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {craftsmenPreview && craftsmenPreview.totalCount > 0 ? (
                <div className="mt-4 border-t border-[#E1E4EA] pt-4">
                  <div className="mb-2">
                    <p className="text-[13px] font-medium text-[#0E121B]">
                      Handwerker (automatisch erkannt)
                    </p>
                    <p className="text-[12px] text-[#525866]">
                      <strong>{craftsmenPreview.totalCount}</strong> Handwerker in{" "}
                      <strong>{craftsmenPreview.sheets.length}</strong> Tabelle
                      {craftsmenPreview.sheets.length === 1 ? "" : "n"}:{" "}
                      {craftsmenPreview.sheets.map((sheet) => sheet.name).join(", ")}
                      {craftsmenPreview.sheets.length > 1
                        ? " — alle werden beim Sync importiert."
                        : null}
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded border border-[#E1E4EA] bg-white">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAFAFA] text-left text-[#525866]">
                          {["Name", "Gewerk", "Telefon", "E-Mail", "Tabelle"].map(
                            (col) => (
                              <th
                                key={col}
                                className="border-b border-[#E1E4EA] px-2 py-1.5 font-medium"
                              >
                                {col}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {craftsmenPreview.previewRecords.slice(0, 12).map((record, index) => (
                          <tr key={`${record.name}-${index}`} className="text-[#0E121B]">
                            <td className="border-b border-[#F2F2F2] px-2 py-1.5 align-top">
                              {record.name}
                            </td>
                            <td className="border-b border-[#F2F2F2] px-2 py-1.5 align-top">
                              {record.trade || (
                                <span className="text-[#C2C6CE]">—</span>
                              )}
                            </td>
                            <td className="border-b border-[#F2F2F2] px-2 py-1.5 align-top">
                              {record.phone || (
                                <span className="text-[#C2C6CE]">—</span>
                              )}
                            </td>
                            <td className="border-b border-[#F2F2F2] px-2 py-1.5 align-top">
                              {record.email || (
                                <span className="text-[#C2C6CE]">—</span>
                              )}
                            </td>
                            <td className="border-b border-[#F2F2F2] px-2 py-1.5 align-top text-[#525866]">
                              {record.sheetName || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {craftsmenPreview.previewRecords.length > 12 ? (
                    <p className="mt-1.5 text-[11px] text-[#99A0AE]">
                      Vorschau: erste 12 von {craftsmenPreview.totalCount} Zeilen
                    </p>
                  ) : null}
                </div>
              ) : inReview && !previewLoading ? (
                <p className="mt-4 border-t border-[#E1E4EA] pt-4 text-[12px] text-[#99A0AE]">
                  Keine Handwerker-Tabelle in dieser Datei erkannt — nur Mieter werden
                  importiert.
                </p>
              ) : null}

              {/* Pre-save stats */}
              <div className="mt-3 rounded border border-[#E1E4EA] bg-white p-2.5">
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[#99A0AE]">
                  Vor dem Speichern {statsLoading ? "· prüft…" : ""}
                </p>
                {stats ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#0E121B]">
                      <span>
                        <strong>{stats.validRows}</strong> gültige Zeilen
                      </span>
                      <span>
                        <strong>{stats.normalizablePhones}</strong> Telefonnummern
                        normalisierbar
                      </span>
                      {stats.unmatchedPhones > 0 ? (
                        <span className="text-amber-700">
                          <strong>{stats.unmatchedPhones}</strong> Nummern nicht
                          normalisierbar
                        </span>
                      ) : null}
                    </div>
                    {stats.problems.length > 0 ? (
                      <details className="text-[12px] text-[#525866]">
                        <summary className="flex cursor-pointer items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {stats.problems.length} problematische Zeile
                          {stats.problems.length === 1 ? "" : "n"}
                        </summary>
                        <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                          {stats.problems.map((problem, index) => (
                            <li key={index}>
                              Zeile {problem.rowNumber}: {problem.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="text-[12px] text-emerald-700">
                        Keine problematischen Zeilen.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#99A0AE]">
                    {mappingNameFilled(mapping)
                      ? "Wird berechnet…"
                      : "Bitte zuerst die Namens-Spalte zuordnen."}
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] text-[#525866]">
                  {mappedFieldCount} Felder zugeordnet
                </span>
                <button
                  type="button"
                  onClick={() => void saveSource()}
                  disabled={saving || !mappingNameFilled(mapping)}
                  className={`${landingBtnPrimary} h-9 px-4 text-[12px] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {saving ? "Speichert…" : "Zuordnung bestätigen & synchronisieren"}
                </button>
              </div>
              {!mappingNameFilled(mapping) ? (
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
