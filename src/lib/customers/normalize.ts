import type {
  CustomerDataProviderId,
  CustomerRecord,
  MappingPreviewStats,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";
import { toE164 } from "@/lib/phone/normalize";

export const MAPPING_FIELD_KEYS: Array<keyof SpreadsheetColumnMapping> = [
  "name",
  "firstName",
  "phone",
  "email",
  "street",
  "zip",
  "city",
  "address",
  "propertyLabel",
  "unit",
  "rentalStart",
  "rentalEnd",
  "rentalInfo",
  "trade",
];

export const EMPTY_COLUMN_MAPPING: SpreadsheetColumnMapping = {
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

function headerKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildHeaderIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = headerKey(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

/**
 * Normalize a stored/suggested mapping to HEADER-NAME form. Accepts the legacy
 * numeric (column-index) format and converts it via the current header row, so
 * existing tenants keep working after the index→name migration.
 */
export function resolveColumnMapping(
  mapping:
    | Partial<Record<keyof SpreadsheetColumnMapping, unknown>>
    | null
    | undefined,
  headers: string[]
): SpreadsheetColumnMapping {
  const out: SpreadsheetColumnMapping = { ...EMPTY_COLUMN_MAPPING };
  if (!mapping) return out;
  for (const field of MAPPING_FIELD_KEYS) {
    const value = (mapping as Record<string, unknown>)[field];
    if (typeof value === "string") {
      out[field] = value.trim();
    } else if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < headers.length
    ) {
      out[field] = String(headers[value] ?? "").trim();
    }
  }
  return out;
}

/** Mapped header names that are missing from the current header row. */
export function missingMappedHeaders(
  mapping: SpreadsheetColumnMapping,
  headers: string[]
): string[] {
  const present = new Set(headers.map(headerKey));
  const missing = new Set<string>();
  for (const field of MAPPING_FIELD_KEYS) {
    const header = mapping[field]?.trim();
    if (header && !present.has(header.toLowerCase())) missing.add(header);
  }
  return Array.from(missing);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asRecordArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map(asRecord).filter((row): row is Record<string, unknown> => row !== null);
  }

  const record = asRecord(data);
  if (!record) return [];

  for (const key of ["value", "data", "items", "results", "nodes", "tenants", "contacts", "customers", "persons"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return asRecordArray(nested);
    }
  }

  return [];
}

function pickString(
  row: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function joinParts(...parts: Array<string | undefined>): string | undefined {
  const value = parts.filter(Boolean).join(" ").trim();
  return value || undefined;
}

function formatDmy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

/**
 * Normalize a spreadsheet date cell to DD.MM.YYYY. Handles Excel serial
 * numbers (days since 1899-12-30, e.g. "44423") and ISO date strings;
 * anything else is returned unchanged.
 */
export function formatSpreadsheetDate(
  value: string | undefined
): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Excel serial date — plausible range 1970-01-01 (25569) .. 2100-12-31.
  if (/^\d{4,5}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= 25569 && serial <= 73415) {
      const ms = Math.round((serial - 25569) * 86_400_000);
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return formatDmy(date);
    }
  }

  // ISO-like date string (YYYY-MM-DD...).
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return formatDmy(date);
  }

  return trimmed;
}

/**
 * Join address parts, dropping empty and duplicate segments. Guards against
 * mappings where several columns (street/zip/city) point at the same cell,
 * which would otherwise repeat the full address multiple times.
 */
function joinAddressParts(...parts: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.length ? unique.join(" ") : undefined;
}

function buildAddress(row: Record<string, unknown>): string | undefined {
  const direct = pickString(row, [
    "address",
    "adresse",
    "fullAddress",
    "Anschrift",
    "anschrift",
  ]);
  if (direct) return direct;

  const street = pickString(row, [
    "street",
    "strasse",
    "Strasse",
    "addressLine1",
    "line1",
  ]);
  const zip = pickString(row, ["zip", "plz", "postalCode", "PLZ"]);
  const city = pickString(row, ["city", "ort", "Ort", "town"]);
  const plzOrt = pickString(row, ["plzort", "plzOrt", "PLZOrt"]);

  if (street && plzOrt) return `${street}, ${plzOrt}`;
  if (street && (zip || city)) {
    return joinParts(street, joinParts(zip, city));
  }

  return joinParts(street, plzOrt);
}

function buildName(row: Record<string, unknown>): string {
  const direct = pickString(row, [
    "name",
    "Name",
    "bez",
    "Bez",
    "displayName",
    "fullName",
    "label",
    "title",
  ]);
  if (direct) return direct;

  const first = pickString(row, ["firstName", "vorname", "Vorname", "givenName"]);
  const last = pickString(row, ["lastName", "nachname", "Nachname", "familyName", "surname"]);
  const combined = joinParts(first, last);
  if (combined) return combined;

  const id = pickString(row, ["id", "s_seqnr", "nr", "number"]);
  return id ? `Kunde ${id}` : "Unbekannter Kunde";
}

function buildPhone(row: Record<string, unknown>): string | undefined {
  return pickString(row, [
    "phone",
    "telefon",
    "Telefon",
    "mobile",
    "mobilePhone",
    "handy",
    "Handy",
    "tel",
    "phoneNumber",
  ]);
}

function buildEmail(row: Record<string, unknown>): string | undefined {
  return pickString(row, ["email", "Email", "mail", "eMail"]);
}

function buildExternalId(
  row: Record<string, unknown>,
  fallbackIndex: number
): string {
  return (
    pickString(row, [
      "s_seqnr",
      "id",
      "Id",
      "nr",
      "number",
      "customerId",
      "tenantId",
      "contactId",
    ]) ?? String(fallbackIndex)
  );
}

export function normalizeGenericCustomer(
  provider: CustomerDataProviderId,
  row: Record<string, unknown>,
  index: number
): CustomerRecord {
  const externalId = buildExternalId(row, index);
  const name = buildName(row);

  return {
    id: `${provider}:${externalId}`,
    provider,
    externalId,
    name,
    phone: buildPhone(row),
    email: buildEmail(row),
    address: buildAddress(row),
    propertyLabel: pickString(row, [
      "propertyLabel",
      "property",
      "liegenschaft",
      "Liegenschaft",
      "objekt",
      "Objekt",
      "unit",
    ]),
  };
}

interface WwLookupMaps {
  liegenschaftById: Map<string, Record<string, unknown>>;
  objektById: Map<string, Record<string, unknown>>;
  verhaeltnisByMieterId: Map<string, Record<string, unknown>>;
}

function mapKey(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function buildWwLookupMaps(
  liegenschaften: unknown,
  objekte: unknown,
  verhaeltnisse: unknown
): WwLookupMaps {
  const liegenschaftById = new Map<string, Record<string, unknown>>();
  for (const row of asRecordArray(liegenschaften)) {
    const key = mapKey(row.s_seqnr);
    if (key) liegenschaftById.set(key, row);
  }

  const objektById = new Map<string, Record<string, unknown>>();
  for (const row of asRecordArray(objekte)) {
    const key = mapKey(row.s_seqnr);
    if (key) objektById.set(key, row);
  }

  const verhaeltnisByMieterId = new Map<string, Record<string, unknown>>();
  for (const row of asRecordArray(verhaeltnisse)) {
    const mieterId = mapKey(row.mieter_seqnr);
    if (mieterId && !verhaeltnisByMieterId.has(mieterId)) {
      verhaeltnisByMieterId.set(mieterId, row);
    }
  }

  return { liegenschaftById, objektById, verhaeltnisByMieterId };
}

export function normalizeWwMieter(
  provider: CustomerDataProviderId,
  row: Record<string, unknown>,
  index: number,
  maps: WwLookupMaps
): CustomerRecord {
  const externalId = buildExternalId(row, index);
  const mieterId = mapKey(row.s_seqnr) ?? externalId;
  const verhaeltnis = mieterId ? maps.verhaeltnisByMieterId.get(mieterId) : undefined;

  const liegId = verhaeltnis ? mapKey(verhaeltnis.liegenschaft_seqnr) : undefined;
  const objId = verhaeltnis ? mapKey(verhaeltnis.objekt_seqnr) : undefined;
  const liegenschaft = liegId ? maps.liegenschaftById.get(liegId) : undefined;
  const objekt = objId ? maps.objektById.get(objId) : undefined;

  const street = liegenschaft ? pickString(liegenschaft, ["strasse", "Strasse"]) : undefined;
  const plzOrt = liegenschaft ? pickString(liegenschaft, ["plzort", "plzOrt"]) : undefined;
  const address = joinParts(street, plzOrt);

  const propertyLabel = joinParts(
    liegenschaft ? pickString(liegenschaft, ["bez", "Bez"]) : undefined,
    objekt ? pickString(objekt, ["bez", "Bez"]) : undefined
  );

  return {
    id: `${provider}:${externalId}`,
    provider,
    externalId,
    name: buildName(row),
    address,
    propertyLabel,
  };
}

export function normalizeSpreadsheetCustomers(
  provider: CustomerDataProviderId,
  rows: string[][]
): CustomerRecord[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((cell) => String(cell ?? "").trim().toLowerCase());
  const findColumn = (...names: string[]) =>
    headers.findIndex((header) =>
      names.some((name) => header.includes(name.toLowerCase()))
    );

  const nameCol = findColumn("name", "kunde", "mieter", "nachname");
  const firstCol = findColumn("vorname", "firstname");
  const phoneCol = findColumn("telefon", "tel", "phone", "handy", "mobile");
  const emailCol = findColumn("email", "mail");
  const streetCol = findColumn("strasse", "adresse", "address", "street");
  const zipCol = findColumn("plz", "zip", "postleitzahl");
  const cityCol = findColumn("ort", "city", "stadt");

  const customers: CustomerRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cell = (index: number) => {
      if (index < 0) return undefined;
      const value = row[index];
      const text = String(value ?? "").trim();
      return text || undefined;
    };

    const lastName = cell(nameCol);
    const firstName = cell(firstCol);
    const name = joinParts(firstName, lastName) ?? lastName;
    if (!name) continue;

    const address = joinAddressParts(
      cell(streetCol),
      cell(zipCol),
      cell(cityCol)
    );

    customers.push({
      id: `${provider}:row-${i}`,
      provider,
      externalId: String(i),
      name,
      phone: cell(phoneCol),
      email: cell(emailCol),
      address,
    });
  }

  return customers;
}

/**
 * Apply a column mapping (by HEADER NAME) to spreadsheet rows and report
 * per-row problems. Row 0 must be the header row. Phone numbers are normalized
 * to strict E.164; non-normalizable numbers keep the row but flag the phone.
 */
export function buildMappingReport(
  provider: CustomerDataProviderId,
  rows: string[][],
  mapping: SpreadsheetColumnMapping,
  recordType: CustomerRecord["recordType"] = "customer"
): { records: CustomerRecord[]; stats: MappingPreviewStats } {
  const emptyStats: MappingPreviewStats = {
    totalRows: 0,
    validRows: 0,
    normalizablePhones: 0,
    unmatchedPhones: 0,
    problems: [],
  };
  if (rows.length < 2) {
    return { records: [], stats: emptyStats };
  }

  const headers = rows[0] ?? [];
  const headerIndex = buildHeaderIndex(headers);

  const indexOf = (header: string): number => {
    const key = header?.trim().toLowerCase();
    if (!key) return -1;
    return headerIndex.get(key) ?? -1;
  };

  const cellAt = (row: string[], header: string): string | undefined => {
    const index = indexOf(header);
    if (index < 0) return undefined;
    const text = String(row[index] ?? "").trim();
    return text || undefined;
  };

  const records: CustomerRecord[] = [];
  const problems: MappingPreviewStats["problems"] = [];
  let validRows = 0;
  let normalizablePhones = 0;
  let unmatchedPhones = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1; // 1-based incl. header → matches spreadsheet rows

    // Skip fully empty rows silently.
    if (row.every((cell) => String(cell ?? "").trim() === "")) continue;

    const lastName = cellAt(row, mapping.name);
    const firstName = cellAt(row, mapping.firstName);
    const name = joinParts(firstName, lastName) ?? lastName ?? firstName;
    if (!name) {
      problems.push({ rowNumber, reason: "Kein Name erkennbar — Zeile übersprungen." });
      continue;
    }

    const phoneRaw = cellAt(row, mapping.phone);
    const phoneNormalized = phoneRaw ? toE164(phoneRaw) ?? undefined : undefined;
    const phoneUnmatched = Boolean(phoneRaw) && !phoneNormalized;
    if (phoneNormalized) normalizablePhones += 1;
    if (phoneUnmatched) {
      unmatchedPhones += 1;
      problems.push({
        rowNumber,
        reason: `Telefon nicht normalisierbar: «${phoneRaw}» (Zeile wird trotzdem gespeichert).`,
      });
    }

    const address =
      cellAt(row, mapping.address) ??
      joinAddressParts(
        cellAt(row, mapping.street),
        cellAt(row, mapping.zip),
        cellAt(row, mapping.city)
      );

    const rentalStart = formatSpreadsheetDate(cellAt(row, mapping.rentalStart));
    const rentalEnd = formatSpreadsheetDate(cellAt(row, mapping.rentalEnd));
    const rentalInfo =
      cellAt(row, mapping.rentalInfo) ??
      (rentalStart || rentalEnd
        ? [rentalStart ? `ab ${rentalStart}` : null, rentalEnd ? `bis ${rentalEnd}` : null]
            .filter(Boolean)
            .join(" ")
        : undefined);

    const raw: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const key = String(header ?? "").trim();
      if (key) raw[key] = row[index] ?? "";
    });

    const typePrefix = recordType === "craftsman" ? "craftsman" : "customer";
    const trade =
      cellAt(row, mapping.trade) ??
      (recordType === "craftsman" ? cellAt(row, mapping.propertyLabel) : undefined);

    validRows += 1;
    records.push({
      id: `${provider}:${typePrefix}:${i}`,
      provider,
      recordType,
      externalId: `${typePrefix}:${i}`,
      name,
      phone: phoneRaw,
      phoneNormalized,
      phoneUnmatched,
      email: cellAt(row, mapping.email),
      address,
      propertyLabel: cellAt(row, mapping.propertyLabel),
      unit: cellAt(row, mapping.unit),
      trade: trade || undefined,
      rentalStart,
      rentalEnd,
      rentalInfo: rentalInfo || undefined,
      raw,
    });
  }

  return {
    records,
    stats: {
      totalRows: rows.length - 1,
      validRows,
      normalizablePhones,
      unmatchedPhones,
      problems: problems.slice(0, 50),
    },
  };
}

/**
 * Apply a column mapping to spreadsheet rows (records only). See
 * {@link buildMappingReport} for the variant that also returns problem stats.
 */
export function applyColumnMapping(
  provider: CustomerDataProviderId,
  rows: string[][],
  mapping: SpreadsheetColumnMapping
): CustomerRecord[] {
  return buildMappingReport(provider, rows, mapping).records;
}

export function dedupeCustomers(customers: CustomerRecord[]): CustomerRecord[] {
  const seen = new Set<string>();
  const result: CustomerRecord[] = [];

  for (const customer of customers) {
    const key = [
      customer.recordType ?? "customer",
      customer.provider,
      customer.name.toLowerCase(),
      customer.phone ?? "",
      customer.address ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(customer);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "de"));
}
