import type {
  CustomerDataProviderId,
  CustomerRecord,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";

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

    const address = joinParts(
      cell(streetCol),
      joinParts(cell(zipCol), cell(cityCol))
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
 * Apply a (AI- or heuristic-derived) column mapping to spreadsheet rows.
 * Limited to the fields used on the customer page: name, address, phone,
 * email, property label and rental-duration info.
 */
export function applyColumnMapping(
  provider: CustomerDataProviderId,
  rows: string[][],
  mapping: SpreadsheetColumnMapping
): CustomerRecord[] {
  if (rows.length < 2) return [];

  const customers: CustomerRecord[] = [];

  const cellAt = (row: string[], index: number): string | undefined => {
    if (index < 0) return undefined;
    const text = String(row[index] ?? "").trim();
    return text || undefined;
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];

    const lastName = cellAt(row, mapping.name);
    const firstName = cellAt(row, mapping.firstName);
    const name = joinParts(firstName, lastName) ?? lastName ?? firstName;
    if (!name) continue;

    const address =
      cellAt(row, mapping.address) ??
      joinParts(
        cellAt(row, mapping.street),
        joinParts(cellAt(row, mapping.zip), cellAt(row, mapping.city))
      );

    const rentalStart = cellAt(row, mapping.rentalStart);
    const rentalEnd = cellAt(row, mapping.rentalEnd);
    const rentalInfo =
      cellAt(row, mapping.rentalInfo) ??
      (rentalStart || rentalEnd
        ? [rentalStart ? `ab ${rentalStart}` : null, rentalEnd ? `bis ${rentalEnd}` : null]
            .filter(Boolean)
            .join(" ")
        : undefined);

    customers.push({
      id: `${provider}:row-${i}`,
      provider,
      externalId: String(i),
      name,
      phone: cellAt(row, mapping.phone),
      email: cellAt(row, mapping.email),
      address,
      propertyLabel: cellAt(row, mapping.propertyLabel),
      rentalStart,
      rentalEnd,
      rentalInfo: rentalInfo || undefined,
    });
  }

  return customers;
}

export function dedupeCustomers(customers: CustomerRecord[]): CustomerRecord[] {
  const seen = new Set<string>();
  const result: CustomerRecord[] = [];

  for (const customer of customers) {
    const key = [
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
