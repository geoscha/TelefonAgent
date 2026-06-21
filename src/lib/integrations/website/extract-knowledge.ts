import "server-only";

import { getEnrichmentConfig } from "@/lib/admin/enrichment-config";
import type { WebsiteScrapeResult } from "@/lib/integrations/website/scrape";
import { formatScrapedPagesForLlm } from "@/lib/integrations/website/scrape";

const MAX_KNOWLEDGE_CHARS = 18_000;

function fallbackKnowledge(result: WebsiteScrapeResult): string {
  const intro = `# Wissensdatenbank: Betreiber-Website (${result.hostname})

Quelle: ${result.baseUrl}
Hinweis: Automatisch aus ${result.pages.length} Seite(n) extrahiert — bitte nur verlässliche Angaben aus dieser Quelle nennen.

## Website-Inhalt (Auszug)`;

  const body = result.pages
    .map((page) => {
      const heading = page.title ?? page.url;
      return `### ${heading}\n${page.text.slice(0, 2500)}`;
    })
    .join("\n\n");

  return `${intro}\n\n${body}`.slice(0, MAX_KNOWLEDGE_CHARS);
}

/**
 * Turns scraped website pages into structured German knowledge-base text.
 */
export async function extractWebsiteKnowledge(
  result: WebsiteScrapeResult
): Promise<string> {
  const config = await getEnrichmentConfig();
  const sourceText = formatScrapedPagesForLlm(result);

  if (!config.apiKey) {
    return fallbackKnowledge(result);
  }

  const system = `Du erstellst eine Wissensdatenbank für Telefon- und Chat-Assistenten einer Schweizer Immobilienverwaltung.
Lies den Website-Inhalt und schreibe AUSSCHLIESSLICH strukturierten Referenztext auf DEUTSCH — keine JSON-Ausgabe.

Gliedere den Text mit Markdown-Überschriften (##):
- **Unternehmen** — wer die Verwaltung ist, Kurzprofil
- **Angebotene Leistungen** — welche Services/Dienstleistungen angeboten werden (Bulletpoints)
- **Online-Services & Formulare** — was online geht (z. B. Schadensmeldung, Kontaktformular, Mieterportal) — explizit ja/nein/unbekannt
- **Kontakt & Erreichbarkeit** — Adresse, Telefon, E-Mail, Öffnungszeiten falls vorhanden
- **Häufige Auskünfte** — typische Fragen, die aus der Website beantwortet werden können (FAQ-Stil)

Regeln:
- Nur Fakten aus dem Website-Text — nichts erfinden.
- Wenn etwas nicht auf der Website steht: «nicht auf der Website angegeben».
- Keine Marketing-Floskeln, sachlich und für Anrufer verständlich.
- Am Anfang eine Zeile: Quelle: ${result.baseUrl}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 2500,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Website: ${result.baseUrl}\n\nInhalt:\n\n${sourceText.slice(0, 12000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackKnowledge(result);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content || content.length < 120) {
      return fallbackKnowledge(result);
    }

    return content.slice(0, MAX_KNOWLEDGE_CHARS);
  } catch {
    return fallbackKnowledge(result);
  }
}
