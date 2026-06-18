import "server-only";

import {
  applyLanguageInstructions,
  normalizeAgentLanguage,
  type AgentLanguageLabel,
} from "@/lib/elevenlabs/agent-config";
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

function fallbackDraft(input: GenerateAgentInput): GeneratedAgentDraft {
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

  let systemPrompt = buildSystemPrompt(name);
  systemPrompt += `\n\n# Branche\nDu arbeitest für: ${industry}.`;
  if (input.goal?.trim()) {
    systemPrompt += `\n\n# Ziel\n${input.goal.trim()}`;
  }
  if (input.website?.trim()) {
    systemPrompt += `\nWebsite: ${input.website.trim()}`;
  }
  systemPrompt = applyLanguageInstructions(systemPrompt, language);

  return {
    name,
    greeting,
    systemPrompt,
    language,
    aiGenerated: false,
    websiteAnalyzed: false,
  };
}

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

  if (!config.apiKey) {
    const draft = fallbackDraft(input);
    return { ...draft, websiteAnalyzed: Boolean(websiteContext) };
  }

  const userBlock = [
    `Branche: ${industry}`,
    `Ziel des Agenten: ${input.goal.trim()}`,
    input.website?.trim() ? `Website-URL: ${input.website.trim()}` : null,
    websiteContext
      ? `\n--- Auszug von ${websiteContext.url} ---\n${websiteContext.excerpt}`
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
      temperature: 0.55,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Du konfigurierst KI-Telefonagenten für Schweizer Unternehmen.

Analysiere Branche, Ziel${websiteContext ? " und Website-Inhalt" : ""} und erstelle einen massgeschneiderten Telefonagenten. Das Ziel ist zentral für Rolle und Anweisungen.

Antworte NUR als JSON:
{
  "name": string,           // kurzer Agent-Name (max 40 Zeichen), z.B. Firmenname + Rolle
  "greeting": string,       // 1–2 Sätze Telefon-Begrüssung, natürlich und freundlich
  "systemPrompt": string    // strukturierte Anweisungen: Rolle, typische Anliegen, FAQ aus Website,
                            // Ton (professionell), Eskalation an Menschen, was der Agent NICHT darf
}

Regeln:
- Sprache: ${language}
- Keine Emojis
- Nutze konkrete Firmen-/Brancheninfos aus der Website wenn vorhanden
- Begrüssung soll zum Unternehmen passen (Name, Leistungen)
- systemPrompt: Markdown-Abschnitte (# Rolle, # Leistungen, # Typische Anfragen, # Eskalation)`,
        },
        { role: "user", content: userBlock },
      ],
    }),
  });

  if (!response.ok) {
    const draft = fallbackDraft(input);
    return { ...draft, websiteAnalyzed: Boolean(websiteContext) };
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    const draft = fallbackDraft(input);
    return { ...draft, websiteAnalyzed: Boolean(websiteContext) };
  }

  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      greeting?: string;
      systemPrompt?: string;
    };
    const fb = fallbackDraft(input);
    const name = parsed.name?.trim() || fb.name;
    const greeting = parsed.greeting?.trim() || fb.greeting;
    let systemPrompt = parsed.systemPrompt?.trim() || fb.systemPrompt;
    systemPrompt = applyLanguageInstructions(systemPrompt, language);

    return {
      name,
      greeting,
      systemPrompt,
      language,
      aiGenerated: true,
      websiteAnalyzed: Boolean(websiteContext),
    };
  } catch {
    const draft = fallbackDraft(input);
    return { ...draft, websiteAnalyzed: Boolean(websiteContext) };
  }
}
