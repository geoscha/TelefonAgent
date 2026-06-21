import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import type { SpreadsheetColumnMapping } from "@/lib/customers/types";

export const EMPTY_COLUMN_MAPPING: SpreadsheetColumnMapping = {
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

const MAPPING_FIELDS = Object.keys(EMPTY_COLUMN_MAPPING) as Array<
  keyof SpreadsheetColumnMapping
>;

function clampIndex(value: unknown, columnCount: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= columnCount) return -1;
  return n;
}

function sanitizeMapping(
  raw: Record<string, unknown>,
  columnCount: number
): SpreadsheetColumnMapping {
  const mapping = { ...EMPTY_COLUMN_MAPPING };
  for (const field of MAPPING_FIELDS) {
    mapping[field] = clampIndex(raw[field], columnCount);
  }
  return mapping;
}

function hasAnyField(mapping: SpreadsheetColumnMapping): boolean {
  return MAPPING_FIELDS.some((field) => mapping[field] >= 0);
}

/** Heuristic fallback when no LLM is configured or the call fails. */
export function heuristicColumnMapping(
  headers: string[]
): SpreadsheetColumnMapping {
  const normalized = headers.map((h) => String(h ?? "").trim().toLowerCase());
  const find = (...names: string[]) =>
    normalized.findIndex((header) =>
      names.some((name) => header.includes(name.toLowerCase()))
    );

  return {
    name: find("name", "kunde", "mieter", "nachname"),
    firstName: find("vorname", "firstname", "first name"),
    phone: find("telefon", "tel", "phone", "handy", "mobile", "natel"),
    email: find("email", "mail", "e-mail"),
    street: find("strasse", "straße", "adresse", "address", "street"),
    zip: find("plz", "zip", "postleitzahl", "postal"),
    city: find("ort", "city", "stadt", "wohnort"),
    address: find("adresse komplett", "volladresse", "full address"),
    propertyLabel: find("liegenschaft", "objekt", "wohnung", "property", "unit", "mietobjekt"),
    rentalStart: find("mietbeginn", "einzug", "vertragsbeginn", "start", "von", "beginn"),
    rentalEnd: find("mietende", "auszug", "vertragsende", "ende", "bis", "kündigung"),
    rentalInfo: find("mietdauer", "vertrag", "befristung", "dauer"),
  };
}

/**
 * Use the configured LLM to map spreadsheet columns to customer fields.
 * Falls back to heuristic header matching if no API key or on error.
 */
export async function inferColumnMapping(
  headers: string[],
  sampleRows: string[][]
): Promise<SpreadsheetColumnMapping> {
  const columnCount = headers.length;
  if (columnCount === 0) return EMPTY_COLUMN_MAPPING;

  const fallback = heuristicColumnMapping(headers);

  let config;
  try {
    config = await getEnrichmentConfig();
  } catch {
    return fallback;
  }
  if (!config.apiKey) return fallback;

  const columnsPreview = headers.map((header, index) => {
    const samples = sampleRows
      .slice(0, 5)
      .map((row) => String(row[index] ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return `${index}: "${header}"${samples.length ? ` — Beispiele: ${samples.join(" | ")}` : ""}`;
  });

  const system = `Du ordnest Spalten einer Mieter-/Kundenliste den passenden Feldern zu.
Antworte AUSSCHLIESSLICH mit JSON. Für jedes Feld gibst du den 0-basierten Spaltenindex an, oder -1 wenn nicht vorhanden.
Felder:
- name: Nachname oder vollständiger Name
- firstName: Vorname (falls separat)
- phone: Telefon-/Handynummer
- email: E-Mail
- street: Strasse + Hausnummer
- zip: Postleitzahl
- city: Ort
- address: vollständige Adresse (falls in einer einzigen Spalte)
- propertyLabel: Liegenschaft/Objekt/Wohnung
- rentalStart: Mietbeginn/Einzug
- rentalEnd: Mietende/Auszug
- rentalInfo: sonstige Mietdauer-/Vertragsinfo
Wähle pro Feld höchstens eine Spalte. Verwende street/zip/city ODER address, nicht beides.`;

  const user = `Spalten:\n${columnsPreview.join("\n")}\n\nGib das Mapping als JSON-Objekt zurück.`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) return fallback;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const mapping = sanitizeMapping(parsed, columnCount);

    return hasAnyField(mapping) ? mapping : fallback;
  } catch {
    return fallback;
  }
}
