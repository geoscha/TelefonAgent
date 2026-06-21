import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import {
  EMPTY_COLUMN_MAPPING,
  MAPPING_FIELD_KEYS,
} from "@/lib/customers/normalize";
import type {
  ColumnMappingConfidence,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";

export { EMPTY_COLUMN_MAPPING };

export interface InferredMapping {
  mapping: SpreadsheetColumnMapping;
  confidence: ColumnMappingConfidence;
}

const FIELD_DESCRIPTIONS: Record<keyof SpreadsheetColumnMapping, string> = {
  name: "Nachname oder vollständiger Name (Pflichtfeld)",
  firstName: "Vorname (nur falls separate Spalte)",
  phone: "Telefon-/Handynummer (Pflichtfeld)",
  email: "E-Mail-Adresse",
  street: "Strasse + Hausnummer",
  zip: "Postleitzahl",
  city: "Ort",
  address: "vollständige Adresse in EINER Spalte (statt street/zip/city)",
  propertyLabel: "Liegenschaft / Objekt (property)",
  unit: "Wohnung / Mietobjekt / Einheit (unit)",
  rentalStart: "Mietbeginn / Einzug",
  rentalEnd: "Mietende / Auszug",
  rentalInfo: "sonstige Vertrags-/Mietdauer-Info (contract_info)",
  trade: "Gewerk / Fachbereich / Branche (Handwerker)",
};

function hasAnyField(mapping: SpreadsheetColumnMapping): boolean {
  return MAPPING_FIELD_KEYS.some((field) => mapping[field].trim().length > 0);
}

function matchHeader(headers: string[], keywords: string[]): string {
  const idx = headers.findIndex((header) => {
    const lower = String(header ?? "").trim().toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
  });
  return idx >= 0 ? String(headers[idx] ?? "").trim() : "";
}

/** Heuristic fallback when no LLM is configured or the call fails. */
export function heuristicColumnMapping(
  headers: string[]
): InferredMapping {
  const mapping: SpreadsheetColumnMapping = {
    name: matchHeader(headers, ["nachname", "name", "kunde", "mieter"]),
    firstName: matchHeader(headers, ["vorname", "firstname", "first name"]),
    phone: matchHeader(headers, ["telefon", "tel", "phone", "handy", "mobile", "natel"]),
    email: matchHeader(headers, ["email", "mail", "e-mail"]),
    street: matchHeader(headers, ["strasse", "straße", "street"]),
    zip: matchHeader(headers, ["plz", "zip", "postleitzahl", "postal"]),
    city: matchHeader(headers, ["ort", "city", "stadt", "wohnort"]),
    address: matchHeader(headers, ["adresse", "volladresse", "full address", "anschrift"]),
    propertyLabel: matchHeader(headers, ["liegenschaft", "objekt", "property", "haus"]),
    unit: matchHeader(headers, ["wohnung", "unit", "mietobjekt", "einheit", "whg"]),
    rentalStart: matchHeader(headers, ["mietbeginn", "einzug", "vertragsbeginn", "beginn"]),
    rentalEnd: matchHeader(headers, ["mietende", "auszug", "vertragsende", "kündigung"]),
    rentalInfo: matchHeader(headers, ["mietdauer", "vertrag", "befristung", "dauer"]),
    trade: matchHeader(headers, [
      "gewerk",
      "fachbereich",
      "branche",
      "trade",
      "kategorie",
      "bereich",
    ]),
  };

  const confidence: ColumnMappingConfidence = {};
  for (const field of MAPPING_FIELD_KEYS) {
    if (mapping[field]) confidence[field] = 0.5; // heuristic = medium confidence
  }

  return { mapping, confidence };
}

function sanitizeAiMapping(
  raw: Record<string, unknown>,
  headers: string[]
): InferredMapping {
  const headerByLower = new Map(
    headers.map((header) => [String(header ?? "").trim().toLowerCase(), String(header ?? "").trim()])
  );
  const mapping: SpreadsheetColumnMapping = { ...EMPTY_COLUMN_MAPPING };
  const confidence: ColumnMappingConfidence = {};

  for (const field of MAPPING_FIELD_KEYS) {
    const entry = raw[field];
    let columnName = "";
    let conf = 0;

    if (typeof entry === "string") {
      columnName = entry;
    } else if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.column === "string") columnName = obj.column;
      else if (typeof obj.header === "string") columnName = obj.header;
      if (typeof obj.confidence === "number") conf = obj.confidence;
    }

    const trimmed = columnName.trim();
    if (!trimmed || trimmed.toLowerCase() === "ignore") continue;
    const resolved = headerByLower.get(trimmed.toLowerCase());
    if (!resolved) continue; // hallucinated header → drop

    mapping[field] = resolved;
    confidence[field] = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.7;
  }

  return { mapping, confidence };
}

/**
 * Use the configured LLM to map spreadsheet columns to customer fields by
 * HEADER NAME, with a per-field confidence. Falls back to heuristic header
 * matching when no API key is set or the call fails.
 */
export async function inferColumnMapping(
  headers: string[],
  sampleRows: string[][]
): Promise<InferredMapping> {
  if (headers.length === 0) {
    return { mapping: { ...EMPTY_COLUMN_MAPPING }, confidence: {} };
  }

  const fallback = heuristicColumnMapping(headers);

  let config;
  try {
    config = await getEnrichmentConfig();
  } catch {
    return fallback;
  }
  if (!config.apiKey) return fallback;

  const columnsPreview = headers.map((header) => {
    const samples = sampleRows
      .slice(0, 5)
      .map((row) => {
        const index = headers.indexOf(header);
        return String(row[index] ?? "").trim();
      })
      .filter(Boolean)
      .slice(0, 3);
    return `"${header}"${samples.length ? ` — Beispiele: ${samples.join(" | ")}` : ""}`;
  });

  const fieldList = MAPPING_FIELD_KEYS.map(
    (field) => `- ${field}: ${FIELD_DESCRIPTIONS[field]}`
  ).join("\n");

  const system = `Du ordnest die Spalten einer Mieter-/Kundenliste den Zielfeldern zu.
Antworte AUSSCHLIESSLICH mit gültigem JSON, KEIN Fliesstext.
Für jedes Zielfeld gibst du ein Objekt { "column": <exakter Spaltenname aus der Liste oder "ignore">, "confidence": <0..1> } zurück.
Verwende NUR Spaltennamen exakt wie angegeben. Wenn kein passender existiert: "column": "ignore".
Zielfelder:
${fieldList}
Wähle pro Feld höchstens eine Spalte. Nutze street/zip/city ODER address, nicht beides.
confidence: 1.0 = sicher, <0.6 = unsicher.`;

  const user = `Spalten (Name + Beispielwerte):\n${columnsPreview.join("\n")}\n\nGib das Mapping als JSON-Objekt zurück, Schlüssel = Zielfeld.`;

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
    const result = sanitizeAiMapping(parsed, headers);

    return hasAnyField(result.mapping) ? result : fallback;
  } catch {
    return fallback;
  }
}
