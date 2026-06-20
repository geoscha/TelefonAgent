import "server-only";

import {
  assistantBranchLabel,
  normalizeAssistantBranch,
  type AssistantBranchId,
} from "@/lib/assistant-branch";
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
import {
  extractBusinessHoursFromText,
  normalizeBusinessHours,
  type BusinessHoursSchedule,
} from "@/lib/integrations/business-hours";
import type { AgentVoiceGender } from "@/lib/elevenlabs/pick-voice";
import {
  greetingForAssistantName,
  suggestAssistantName,
} from "@/lib/elevenlabs/assistant-names";

export interface GenerateAgentInput {
  branch: AssistantBranchId;
  website?: string;
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
  businessHours?: BusinessHoursSchedule;
}

const SECTION_KEYS: (keyof PromptSections)[] = [
  "rolle",
  "leistungen",
  "typischeAnfragen",
  "gespraechsfuehrung",
  "eskalation",
  "abschluss",
  "branche",
  "sonstiges",
];

function industryLabel(input: GenerateAgentInput): string {
  return assistantBranchLabel(normalizeAssistantBranch(input.branch));
}

function defaultTypicalRequests(branch: AssistantBranchId): string {
  if (branch === "coiffeur") {
    return "- Termine für Haareschneiden und Behandlungen\n- Fragen zu Öffnungszeiten und Verfügbarkeit\n- Terminverschiebungen und Stornos";
  }
  return "- Anrufe entgegennehmen und Anliegen aufnehmen\n- Rückrufwünsche notieren\n- Allgemeine Fragen beantworten";
}

function buildFallbackSections(
  input: GenerateAgentInput,
  agentName: string,
  websiteAnalyzed: boolean
): PromptSections {
  const branch = normalizeAssistantBranch(input.branch);
  const industry = industryLabel(input);
  const parsed = parseSystemPrompt(buildSystemPrompt(agentName));

  const sonstigesParts: string[] = [];
  if (parsed.sonstiges.trim()) sonstigesParts.push(parsed.sonstiges.trim());
  if (input.website?.trim()) {
    sonstigesParts.push(
      websiteAnalyzed
        ? `Nutze Informationen von der Website ${input.website.trim()} in den Antworten.`
        : `Website des Unternehmens: ${input.website.trim()}`
    );
  }
  if (branch === "coiffeur") {
    sonstigesParts.push(
      "Termine nur auf Namen vereinbaren — Datum und Uhrzeit müssen klar bestätigt werden."
    );
  } else {
    sonstigesParts.push(
      "Versprich keine verbindlichen Zusagen ohne Rückfrage beim Auftraggeber."
    );
  }

  return {
    ...parsed,
    typischeAnfragen: parsed.typischeAnfragen.trim() || defaultTypicalRequests(branch),
    branche: industry,
    ziel: "",
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
    businessHours?: BusinessHoursSchedule;
  }
): GeneratedAgentDraft {
  const sections: PromptSections = {
    ...params.sections,
    branche: params.sections.branche.trim() || industryLabel(input),
    ziel: "",
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
    businessHours: params.businessHours,
  };
}

function resolveBusinessHoursFromWebsite(
  websiteContext: { excerpt: string } | null
): BusinessHoursSchedule | undefined {
  if (!websiteContext?.excerpt) return undefined;
  const extracted = extractBusinessHoursFromText(websiteContext.excerpt);
  return extracted ? normalizeBusinessHours(extracted) : undefined;
}

function fallbackDraft(
  input: GenerateAgentInput,
  websiteAnalyzed = false,
  websiteContext: { url: string; excerpt: string } | null = null
): GeneratedAgentDraft {
  const language = normalizeAgentLanguage(input.language);
  const branch = normalizeAssistantBranch(input.branch);
  const industry = industryLabel(input);
  const name = suggestAssistantName(input.gender);

  const greeting = greetingForAssistantName(name, language, industry);

  return finalizeDraft(input, {
    name,
    greeting,
    sections: buildFallbackSections(input, name, websiteAnalyzed),
    language,
    aiGenerated: false,
    websiteAnalyzed,
    businessHours:
      branch === "coiffeur"
        ? resolveBusinessHoursFromWebsite(websiteContext)
        : undefined,
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
    merged.branche = industryLabel(input);
    merged.ziel = "";
    return merged;
  }

  if (typeof parsed.systemPrompt === "string" && parsed.systemPrompt.trim()) {
    const fromPrompt = parseSystemPrompt(parsed.systemPrompt);
    return {
      ...buildFallbackSections(input, fallbackName, websiteAnalyzed),
      ...fromPrompt,
      branche: industryLabel(input),
      ziel: "",
    };
  }

  return buildFallbackSections(input, fallbackName, websiteAnalyzed);
}

const AI_SYSTEM_PROMPT = (language: string, hasWebsite: boolean, branch: AssistantBranchId) =>
  `Du konfigurierst KI-Telefonassistenten für Schweizer Kundinnen und Kunden.

Branche: ${assistantBranchLabel(branch)}.
Analysiere Branche${hasWebsite ? " und Website-Inhalt" : ""} und erstelle einen massgeschneiderten Telefonassistenten.

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
    "sonstiges": string
  }
}

Fülle die sections knapp aus — insgesamt höchstens ${MAX_AGENT_INSTRUCTION_PARAGRAPHS} Absätze und ${MAX_AGENT_INSTRUCTION_WORDS} Wörter im fertigen Anweisungstext:
- rolle: 1 kurzer Satz, wer der Assistent ist
- leistungen: 2–3 Bulletpoints, was der Assistent darf
- typischeAnfragen: 2–3 häufige Anliegen${hasWebsite ? " (nur Wesentliches aus Website)" : ""}
- gespraechsfuehrung: Ton, Rückfragen, keine verbindlichen Zusagen
- eskalation: wann an Menschen übergeben
- abschluss: kurz Verabschiedung
- branche: 1 Satz Kontext zur gewählten Branche
- sonstiges: nur wenn nötig, 1 kurzer Hinweis

Regeln:
- Sprache: ${language}
- Keine Emojis, keine langen Texte, kein Marketing-Floskeln
- Nur das Nötigste — wenig Kontext, telefonisch umsetzbar${
    branch === "coiffeur"
      ? "\n- Coiffeur: Terminvereinbarung auf Namen ist zentral"
      : "\n- Privater Assistent: keine Terminbuchung, Anliegen aufnehmen und weiterleiten"
  }`;

export async function generateAgentDraft(
  input: GenerateAgentInput
): Promise<GeneratedAgentDraft> {
  const branch = normalizeAssistantBranch(input.branch);
  const language = normalizeAgentLanguage(input.language);
  const genderLabel = input.gender === "male" ? "männlich" : "weiblich";
  const config = await getEnrichmentConfig();

  let websiteContext: { url: string; excerpt: string } | null = null;
  if (input.website?.trim()) {
    websiteContext = await fetchWebsiteContext(input.website.trim());
  }
  const websiteAnalyzed = Boolean(websiteContext);

  if (!config.apiKey) {
    return fallbackDraft(input, websiteAnalyzed, websiteContext);
  }

  const userBlock = [
    `Branche: ${industryLabel(input)}`,
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
          content: AI_SYSTEM_PROMPT(language, Boolean(websiteContext), branch),
        },
        { role: "user", content: userBlock },
      ],
    }),
  });

  if (!response.ok) {
    return fallbackDraft(input, websiteAnalyzed, websiteContext);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    return fallbackDraft(input, websiteAnalyzed, websiteContext);
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fb = fallbackDraft(input, websiteAnalyzed, websiteContext);
    const sections = sectionsFromAiResponse(
      parsed,
      input,
      fb.name,
      websiteAnalyzed
    );

    return finalizeDraft(input, {
      name: fb.name,
      greeting: greetingForAssistantName(
        fb.name,
        language,
        industryLabel(input)
      ),
      sections,
      language,
      aiGenerated: true,
      websiteAnalyzed,
      businessHours:
        branch === "coiffeur"
          ? resolveBusinessHoursFromWebsite(websiteContext)
          : undefined,
    });
  } catch {
    return fallbackDraft(input, websiteAnalyzed, websiteContext);
  }
}
