import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import type {
  CallCategory,
  SuggestedAction,
  SuggestionType,
  Urgency,
} from "@/lib/types";

export interface EnrichmentInput {
  transcriptText: string;
  /** ElevenLabs' own analysis, used as the fallback when no LLM key is set. */
  fallbackTitle?: string;
  fallbackSummary?: string;
}

export interface EnrichmentResult {
  title: string;
  category: CallCategory;
  urgency: Urgency;
  summary: string;
  /** Name of the caller if they introduced themselves during the call. */
  callerName?: string;
  suggestedActions: SuggestedAction[];
}

const CATEGORIES: CallCategory[] = [
  "Schadenmeldung",
  "Mietzins",
  "Besichtigung",
  "Allgemein",
  "Notfall",
];
const URGENCIES: Urgency[] = ["niedrig", "mittel", "hoch"];
const SUGGESTION_TYPES: SuggestionType[] = [
  "Kalendereintrag",
  "Aufgabe",
  "Rückruf",
  "Eskalation",
];

export async function isEnrichmentEnabled(): Promise<boolean> {
  const config = await getEnrichmentConfig();
  return Boolean(config.apiKey);
}

/**
 * Runs one LLM pass over the transcript to produce a tight German title,
 * category, urgency, summary and suggested actions. Gated behind its own env
 * key — if absent, falls back to ElevenLabs' own analysis + light heuristics.
 */
export async function enrichCall(
  input: EnrichmentInput
): Promise<EnrichmentResult> {
  if (await isEnrichmentEnabled()) {
    try {
      return await runLlmEnrichment(input);
    } catch (error) {
      console.error("[enrichment] LLM pass failed, falling back:", error);
    }
  }
  return heuristicFallback(input);
}

async function runLlmEnrichment(
  input: EnrichmentInput
): Promise<EnrichmentResult> {
  const config = await getEnrichmentConfig();
  if (!config.apiKey) {
    throw new Error("Enrichment API key missing");
  }

  const baseUrl = config.baseUrl;
  const model = config.model;

  const system = `Du bist ein Analyse-Assistent für eine Schweizer Liegenschaftsverwaltung. Lies das Telefon-Transkript und gib AUSSCHLIESSLICH gültiges JSON zurück. ALLE Textfelder müssen auf DEUTSCH sein, niemals Englisch.
{
  "title": string,            // 2–4 Wörter, prägnant, Deutsch (z. B. "Wasserschaden Bad")
  "category": one of ${JSON.stringify(CATEGORIES)},
  "urgency": one of ${JSON.stringify(URGENCIES)},
  "summary": string,          // 1–2 Sätze, sachlich, Deutsch
  "caller_name": string|null, // Name der anrufenden Person, falls sie sich vorstellt (sonst null)
  "suggested_actions": [      // 0–3 konkrete nächste Schritte
    { "label": string, "type": one of ${JSON.stringify(SUGGESTION_TYPES)} }
  ]
}
Notfälle (Feuer, Gas, grosser Wasseraustritt, Personengefährdung) sind immer "Notfall" mit urgency "hoch".`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Transkript:\n\n${input.transcriptText.slice(0, 8000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Enrichment HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    title?: string;
    category?: string;
    urgency?: string;
    summary?: string;
    caller_name?: string | null;
    suggested_actions?: { label?: string; type?: string }[];
  };

  const fallback = heuristicFallback(input);

  return {
    title: parsed.title?.trim() || fallback.title,
    category: coerceCategory(parsed.category) ?? fallback.category,
    urgency: coerceUrgency(parsed.urgency) ?? fallback.urgency,
    summary: parsed.summary?.trim() || fallback.summary,
    callerName: parsed.caller_name?.trim() || fallback.callerName,
    suggestedActions:
      parsed.suggested_actions
        ?.filter((a) => a.label)
        .slice(0, 3)
        .map((a, i) => ({
          id: `act-${Date.now()}-${i}`,
          label: a.label as string,
          type: coerceSuggestionType(a.type) ?? "Aufgabe",
          status: "offen" as const,
        })) ?? fallback.suggestedActions,
  };
}

function heuristicFallback(input: EnrichmentInput): EnrichmentResult {
  const text = input.transcriptText.toLowerCase();
  const category = detectCategory(text);
  const urgency = detectUrgency(text, category);

  const callerLines = extractCallerLines(input.transcriptText);
  const callerName = extractCallerName(callerLines.join(" "));

  // German guarantee: never surface ElevenLabs' English title/summary in the
  // feed. Build a German title from the category and a German summary from the
  // caller's own (German) words.
  const title = defaultTitleForCategory(category);
  const summary = germanSummaryFromTranscript(callerLines, category);
  const suggestedActions: SuggestedAction[] = /termin|haareschneiden|haarschnitt|reserv|behandlung|uhr|frei|verfügbar/i.test(
    text
  )
    ? [
        {
          id: `act-${Date.now()}-cal`,
          label: "Termin eintragen",
          type: "Kalendereintrag",
          status: "offen",
        },
      ]
    : [];

  return { title, category, urgency, summary, callerName, suggestedActions };
}

/** Returns the caller's spoken lines (text only) from a "Speaker: text" dump. */
function extractCallerLines(transcriptText: string): string[] {
  return transcriptText
    .split("\n")
    .filter((l) => l.startsWith("Anrufer:"))
    .map((l) => l.replace(/^Anrufer:\s*/, "").trim())
    .filter((l) => l && l !== "...");
}

/** Heuristically extracts a name when the caller introduces themselves. */
function extractCallerName(callerText: string): string | undefined {
  const N = "(?:Herr |Frau )?([A-ZÄÖÜ][a-zäöüß]+(?:\\s+[A-ZÄÖÜ][a-zäöüß]+)?)";
  const patterns = [
    new RegExp(`[Mm]ein [Nn]ame ist ${N}`),
    new RegExp(`[Ii]ch hei(?:ss|ß)e ${N}`),
    new RegExp(`(?:[Hh]ier|[Dd]a) (?:ist|spricht) ${N}`),
    new RegExp(`[Ss]ie sprechen mit ${N}`),
    new RegExp(`[Ii]ch bin ${N}`),
  ];
  for (const re of patterns) {
    const m = callerText.match(re);
    const name = m?.[1]?.trim();
    // Guard against false positives like "ich bin Mieter".
    if (name && !/^(Mieter|Eigentümer|Verwalter|Kunde)/i.test(name)) {
      return name;
    }
  }
  return undefined;
}

function germanSummaryFromTranscript(
  callerLines: string[],
  category: CallCategory
): string {
  const said = callerLines.slice(0, 2).join(" ").trim();
  if (said) {
    const clipped = said.length > 220 ? `${said.slice(0, 217)}…` : said;
    return `Anliegen der anrufenden Person: ${clipped}`;
  }
  switch (category) {
    case "Notfall":
      return "Notfallmeldung — sofortige Bearbeitung erforderlich.";
    case "Schadenmeldung":
      return "Eine Schadenmeldung wurde aufgenommen.";
    case "Mietzins":
      return "Anfrage zu Mietzins bzw. Nebenkosten.";
    case "Besichtigung":
      return "Anfrage zu einem Besichtigungs- oder Übergabetermin.";
    default:
      return "Allgemeine Anfrage entgegengenommen.";
  }
}

function detectCategory(text: string): CallCategory {
  if (/(feuer|brand|gas|gasgeruch|notfall|überschwemm|personen)/.test(text)) {
    return "Notfall";
  }
  if (/(schaden|defekt|kaputt|leck|wasser|heizung|lift|strom)/.test(text)) {
    return "Schadenmeldung";
  }
  if (/(miete|mietzins|nebenkosten|abrechnung|zahlung)/.test(text)) {
    return "Mietzins";
  }
  if (/(besichtig|termin|wohnungsabgabe|übergabe)/.test(text)) {
    return "Besichtigung";
  }
  return "Allgemein";
}

function detectUrgency(text: string, category: CallCategory): Urgency {
  if (category === "Notfall") return "hoch";
  if (/(dringend|sofort|gefahr|läuft|überschwemm)/.test(text)) return "hoch";
  if (category === "Schadenmeldung") return "mittel";
  return "niedrig";
}

function defaultTitleForCategory(category: CallCategory): string {
  switch (category) {
    case "Notfall":
      return "Notfallmeldung";
    case "Schadenmeldung":
      return "Schadenmeldung";
    case "Mietzins":
      return "Mietzins-Anfrage";
    case "Besichtigung":
      return "Terminanfrage";
    default:
      return "Allgemeine Anfrage";
  }
}

function coerceCategory(value?: string): CallCategory | null {
  return CATEGORIES.find((c) => c === value) ?? null;
}

function coerceUrgency(value?: string): Urgency | null {
  return URGENCIES.find((u) => u === value) ?? null;
}

function coerceSuggestionType(value?: string): SuggestionType | null {
  return SUGGESTION_TYPES.find((t) => t === value) ?? null;
}
