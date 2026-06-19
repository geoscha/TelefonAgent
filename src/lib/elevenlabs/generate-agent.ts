import "server-only";

import {
  applyLanguageInstructions,
  normalizeAgentLanguage,
  type AgentLanguageLabel,
} from "@/lib/elevenlabs/agent-config";
import {
  composeSystemPrompt,
  enforceInstructionLimits,
  MAX_AGENT_INSTRUCTION_PARAGRAPHS,
  MAX_AGENT_INSTRUCTION_WORDS,
  parseSystemPrompt,
  type PromptSections,
} from "@/lib/elevenlabs/prompt-sections";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import { fetchWebsiteContext } from "@/lib/enrichment/website-context";
import type { AgentVoiceGender } from "@/lib/elevenlabs/pick-voice";

export interface GenerateAgentInput {
  industry: string;
  website?: string;
  goal: string;
  gender: AgentVoiceGender;
  language: AgentLanguageLabel;
}

export interface GeneratedAgentDraft {
  name: string;
  greeting: string;
  systemPrompt: string;
  language: AgentLanguageLabel;
  aiGenerated: boolean;
  websiteAnalyzed: boolean;
}

const SECTION_KEYS: (keyof PromptSections)[] = [
  "rolle",
  "leistungen",
  "typischeAnfragen",
  "gespraechsfuehrung",
  "eskalation",
  "abschluss",
  "branche",
  "ziel",
  "sonstiges",
];

function buildFallbackSections(
  input: GenerateAgentInput,
  agentName: string,
  websiteAnalyzed: boolean
): PromptSections {
  const industry = input.industry.trim();
  const parsed = parseSystemPrompt(buildSystemPrompt(agentName));

  const typischeAnfragen =
    parsed.typischeAnfragen.trim() ||
    `- Anfragen zu ${industry}, Termine und Rückrufwünsche`;

  const sonstigesParts: string[] = [];
  if (parsed.sonstiges.trim()) sonstigesParts.push(parsed.sonstiges.trim());
  if (input.website?.trim()) {
    sonstigesParts.push(
      websiteAnalyzed
        ? `Nutze Informationen von der Website ${input.website.trim()} in den Antworten.`
        : `Website des Unternehmens: ${input.website.trim()}`
    );
  }
  sonstigesParts.push(
    "Versprich keine verbindlichen Preise oder Termine ohne Rückfrage beim Team."
  );

  return {
    ...parsed,
    typischeAnfragen,
    branche: industry,
    ziel: input.goal.trim(),
    sonstiges: sonstigesParts.join("\n\n"),
  };
}

function finalizeDraft(
  input: GenerateAgentInput,
  params: {
    name: string;
    greeting: string;
    sections: PromptSections;
    language: AgentLanguageLabel;
    aiGenerated: boolean;
    websiteAnalyzed: boolean;
  }
): GeneratedAgentDraft {
  const sections: PromptSections = {
    ...params.sections,
    branche: params.sections.branche.trim() || input.industry.trim(),
    ziel: params.sections.ziel.trim() || input.goal.trim(),
  };

  let systemPrompt = composeSystemPrompt(sections);
  systemPrompt = applyLanguageInstructions(systemPrompt, params.language);
  systemPrompt = enforceInstructionLimits(systemPrompt);

  return {
    name: params.name,
    greeting: params.greeting,
    systemPrompt,
    language: params.language,
    aiGenerated: params.aiGenerated,
    websiteAnalyzed: params.websiteAnalyzed,
  };
}

function fallbackDraft(
  input: GenerateAgentInput,
  websiteAnalyzed = false
): GeneratedAgentDraft {
  const language = normalizeAgentLanguage(input.language);
  const industry = input.industry.trim() || "Ihr Unternehmen";
  const name = `${industry.split(/\s+/).slice(0, 2).join(" ")} Agent`.slice(
    0,
    40
  );

  const greeting =
    language === "Schweizerdeutsch"
      ? `Grüezi, da isch de Telefonagänt vo ${industry}. Wie cha ich Ihne hälfe?`
      : `Guten Tag, Sie sprechen mit dem Telefonagenten von ${industry}. Wie kann ich Ihnen helfen?`;

  return finalizeDraft(input, {
    name,
    greeting,
    sections: buildFallbackSections(input, name, websiteAnalyzed),
    language,
    aiGenerated: false,
    websiteAnalyzed,
  });
}

function sectionsFromAiResponse(
  parsed: Record<string, unknown>,
  input: GenerateAgentInput,
  fallbackName: string,
  websiteAnalyzed: boolean
): PromptSections {
  const rawSections = parsed.sections;
  if (rawSections && typeof rawSections === "object") {
    const merged = buildFallbackSections(input, fallbackName, websiteAnalyzed);
    for (const key of SECTION_KEYS) {
      const value = (rawSections as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        merged[key] = value.trim();
      }
    }
    return merged;
  }

  if (typeof parsed.systemPrompt === "string" && parsed.systemPrompt.trim()) {
    const fromPrompt = parseSystemPrompt(parsed.systemPrompt);
    return {
      ...buildFallbackSections(input, fallbackName, websiteAnalyzed),
      ...fromPrompt,
      branche: fromPrompt.branche.trim() || input.industry.trim(),
      ziel: fromPrompt.ziel.trim() || input.goal.trim(),
    };
  }

  return buildFallbackSections(input, fallbackName, websiteAnalyzed);
}

const AI_SYSTEM_PROMPT = (language: string, hasWebsite: boolean) =>
  `Du konfigurierst KI-Telefonagenten für Schweizer Unternehmen.

Analysiere Branche, Ziel${hasWebsite ? " und Website-Inhalt" : ""} und erstelle einen massgeschneiderten Telefonagenten.

Antworte NUR als JSON:
{
  "name": string,
  "greeting": string,
  "sections": {
    "rolle": string,
    "leistungen": string,
    "typischeAnfragen": string,
    "gespraechsfuehrung": string,
    "eskalation": string,
    "abschluss": string,
    "branche": string,
    "ziel": string,
    "sonstiges": string
  }
}

Fülle die sections knapp aus — insgesamt höchstens ${MAX_AGENT_INSTRUCTION_PARAGRAPHS} Absätze und ${MAX_AGENT_INSTRUCTION_WORDS} Wörter im fertigen Anweisungstext:
- rolle: 1 kurzer Satz, wer der Agent ist
- leistungen: 2–3 Bulletpoints, was der Agent darf
- typischeAnfragen: 2–3 häufige Anliegen${hasWebsite ? " (nur Wesentliches aus Website)" : ""}
- gespraechsfuehrung: Ton, Rückfragen, keine verbindlichen Zusagen
- eskalation: wann an Menschen übergeben
- abschluss: kurz Verabschiedung
- branche: 1 Satz Kontext
- ziel: 1 Satz Hauptziel
- sonstiges: nur wenn nötig, 1 kurzer Hinweis

Regeln:
- Sprache: ${language}
- Keine Emojis, keine langen Texte, kein Marketing-Floskeln
- Nur das Nötigste — wenig Kontext, telefonisch umsetzbar`;

export async function generateAgentDraft(
  input: GenerateAgentInput
): Promise<GeneratedAgentDraft> {
  const industry = input.industry.trim();
  if (!industry) {
    throw new Error("Branche fehlt.");
  }

  const language = normalizeAgentLanguage(input.language);
  const genderLabel = input.gender === "male" ? "männlich" : "weiblich";
  const config = await getEnrichmentConfig();

  let websiteContext: { url: string; excerpt: string } | null = null;
  if (input.website?.trim()) {
    websiteContext = await fetchWebsiteContext(input.website.trim());
  }
  const websiteAnalyzed = Boolean(websiteContext);

  if (!config.apiKey) {
    return fallbackDraft(input, websiteAnalyzed);
  }

  const userBlock = [
    `Branche: ${industry}`,
    `Ziel des Agenten: ${input.goal.trim()}`,
    input.website?.trim() ? `Website-URL: ${input.website.trim()}` : null,
    websiteContext
      ? `\n--- Kurzauszug von ${websiteContext.url} ---\n${websiteContext.excerpt.slice(0, 2500)}`
      : input.website?.trim()
        ? "\n(Hinweis: Website konnte nicht gelesen werden — nutze Branche und URL.)"
        : null,
    `Stimme: ${genderLabel}`,
    `Sprache: ${language}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.45,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: AI_SYSTEM_PROMPT(language, Boolean(websiteContext)),
        },
        { role: "user", content: userBlock },
      ],
    }),
  });

  if (!response.ok) {
    return fallbackDraft(input, websiteAnalyzed);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    return fallbackDraft(input, websiteAnalyzed);
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fb = fallbackDraft(input, websiteAnalyzed);
    const name =
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : fb.name;
    const greeting =
      typeof parsed.greeting === "string" && parsed.greeting.trim()
        ? parsed.greeting.trim()
        : fb.greeting;
    const sections = sectionsFromAiResponse(
      parsed,
      input,
      name,
      websiteAnalyzed
    );

    return finalizeDraft(input, {
      name,
      greeting,
      sections,
      language,
      aiGenerated: true,
      websiteAnalyzed,
    });
  } catch {
    return fallbackDraft(input, websiteAnalyzed);
  }
}
