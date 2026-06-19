import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import { buildDemoAgentContextBlock } from "@/lib/demo/cura-product-context";
import { demoLanguageInstructions } from "@/lib/demo/voices";

export type DemoMessage = {
  role: "user" | "assistant";
  content: string;
};

export const DEFAULT_DEMO_GREETING_DE =
  "Guten Tag, hier ist Cura. Haben Sie Fragen zu unserem KI-Telefonagenten? Ich beantworte sie gern — zum Beispiel zu Preisen, Funktionen oder dem Setup.";

export const DEFAULT_DEMO_GREETING_CH =
  "Grüezi, da isch Cura. Hätsch Frage zu üsem KI-Telefonagänt? Gern beantwort ich sie — z. B. zu Priis, Funktione oder Setup.";

/** @deprecated Use DEFAULT_DEMO_GREETING_DE */
export const DEMO_GREETING_DE = DEFAULT_DEMO_GREETING_DE;

/** @deprecated Use DEFAULT_DEMO_GREETING_CH */
export const DEMO_GREETING_CH = DEFAULT_DEMO_GREETING_CH;

export function demoGreeting(
  language: AgentLanguageLabel,
  customGreeting?: string | null
): string {
  if (customGreeting?.trim()) return customGreeting.trim();
  return language === "Schweizerdeutsch"
    ? DEFAULT_DEMO_GREETING_CH
    : DEFAULT_DEMO_GREETING_DE;
}

const FALLBACK_REPLIES_DE: { match: RegExp; reply: string }[] = [
  {
    match: /preis|kosten|gratis|abo|tarif|chf|token|guthaben|auflad/i,
    reply:
      "Cura läuft über Tokens: Gesprächszeit kostet 600 Tokens pro Minute, eine Telefonnummer 1'800 Tokens pro Monat. Sie laden Pakete unter Abrechnung auf — ab CHF 0.50 — oder nutzen Pay as you Go mit hinterlegter Karte.",
  },
  {
    match: /vorteil|nutzen|warum|was bringt|funktion/i,
    reply:
      "Cura entlastet Ihr Team: Anrufe werden automatisch angenommen, transkribiert und zusammengefasst. Schäden und Termine landen strukturiert in Ihrer Übersicht — ohne Warteschleife für Mieter.",
  },
  {
    match: /schaden|wasser|lift|notfall/i,
    reply:
      "Im echten Betrieb erfasse ich Schäden mit Adresse und Dringlichkeit und leite Notfälle sofort weiter. In der App sehen Sie alle Anrufe mit Transkript und Aufzeichnung.",
  },
  {
    match: /termin|kalender|besichtig/i,
    reply:
      "Mit Cura Pro bucht der Telefonagent Termine direkt in Google, Outlook oder Apple Kalender — Mieter bekommen sofort Bestätigung, ohne Hin und Her per E-Mail.",
  },
  {
    match: /anruf|telefon|weiterleitung|nummer/i,
    reply:
      "Sie leiten Ihre Geschäftsnummer an Cura weiter — der Telefonagent antwortet in Ihrem Namen. Sie behalten die volle Kontrolle über Begrüssung, Stimme und Anweisungen.",
  },
  {
    match: /grüezi|hallo|guten tag|hi/i,
    reply:
      "Gern erkläre ich Ihnen Preise, Funktionen und Setup — so entlastet Cura Ihre Verwaltung im Alltag.",
  },
];

const FALLBACK_REPLIES_CH: { match: RegExp; reply: string }[] = [
  {
    match: /preis|kosten|gratis|abo|tarif|chf|token|guthabe|uflad/i,
    reply:
      "Cura lauft über Tokens: Gspröchsziit chostet 600 Tokens pro Minute, e Telefonnummere 1'800 Tokens pro Monet. Du ladisch Paket unter Abrechnig uf — ab CHF 0.50 — oder nutzisch Pay as you Go mit hinterlegter Charte.",
  },
  {
    match: /vorteil|nutzen|warum|was bringt|funktion/i,
    reply:
      "Cura entlastet dis Team: Ahruuf werded automatisch agnoo, transkribiert und zämmegfasst. Schäde und Termin landid strukturiert i de Übersicht — ohni Warteschleife für Mieter.",
  },
  {
    match: /schaden|wasser|lift|notfall/i,
    reply:
      "Im echte Betrieb erfass ich Schäde mit Adresse und Dringlichkeit und leit Notfäll sofort wiiter. In de App gsehnsch alli Ahruuf mit Transkript und Ufnahm.",
  },
  {
    match: /termin|kalender|besichtig/i,
    reply:
      "Mit Cura Pro bucht de Telefonagänt Termin direkt i Google, Outlook oder Apple Kalender — Mieter bechömed sofort e Bestätigung.",
  },
  {
    match: /anruf|telefon|weiterleitung|nummer/i,
    reply:
      "Du leitisch d'Gschaftsnummere a Cura wiiter — de Telefonagänt antwortet in dim Name. Du behaltsch d'Kontrolle über Begrüssig, Stimm und Aawisige.",
  },
  {
    match: /grüezi|hallo|guten tag|hi|salü/i,
    reply:
      "Gern zeig ich dir Priis, Funktionen und Setup — so entlastet Cura dini Verwaltig im Alltag.",
  },
];

const FALLBACK_DEFAULT_DE =
  "Gern erkläre ich mehr: Anrufe automatisch annehmen, Transkripte, Terminbuchung und klare Übersicht für Ihr Team. Was möchten Sie als Nächstes wissen?";

const FALLBACK_DEFAULT_CH =
  "Gern verzell ich meh: Ahruuf automatisch ahnoo, Transkript, Terminbuechig und klari Übersicht für dis Team. Was wotsch als Nächschts wüsse?";

export function fallbackDemoReply(
  userText: string,
  language: AgentLanguageLabel = "Deutsch"
): string {
  const list =
    language === "Schweizerdeutsch" ? FALLBACK_REPLIES_CH : FALLBACK_REPLIES_DE;
  for (const { match, reply } of list) {
    if (match.test(userText)) return reply;
  }
  return language === "Schweizerdeutsch"
    ? FALLBACK_DEFAULT_CH
    : FALLBACK_DEFAULT_DE;
}

export function buildDemoSystemPrompt(
  language: AgentLanguageLabel,
  adminContext?: string | null
): string {
  const knowledge = buildDemoAgentContextBlock(language, adminContext);
  const base =
    language === "Schweizerdeutsch"
      ? `Du bisch de Cura-Demo-Telefonagänt uf de Landingpage.
Din Ziel: Frage zuerst, ob öpper Frage zu Cura het, und beantworte sie klar und überzeugend.
Antwort in 1–3 Sätz, freundlich und professionell. Kei Emojis.
Verwende nie s Wort «Agent» alleine — immer «Telefonagänt».
Wenn öpper überzeugt wirkt, lad zum gratis Test ii.`
      : `Du bist der Cura-Demo-Telefonagent auf der Landingpage.
Dein Ziel: Frage zuerst, ob die Person Fragen zu Cura hat, und beantworte sie klar und überzeugend.
Antworte in 1–3 Sätzen, freundlich und professionell. Keine Emojis.
Verwende nie das Wort «Agent» allein — sage «Telefonagent».
Wenn jemand überzeugt wirkt, lade zum kostenlosen Test ein.`;

  const lang = demoLanguageInstructions(language);
  const parts = [base, knowledge];
  if (lang) parts.push(lang);
  return parts.join("\n\n");
}
