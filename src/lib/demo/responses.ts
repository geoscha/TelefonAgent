import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import { demoLanguageInstructions } from "@/lib/demo/voices";

export type DemoMessage = {
  role: "user" | "assistant";
  content: string;
};

export const DEMO_GREETING_DE =
  "Guten Tag. Ich bin Cura — Ihr KI-Telefonagent für Liegenschaftsverwaltungen. Ich nehme Anrufe entgegen, erfasse Schäden, kläre Mietfragen und buche Termine — auch nachts und am Wochenende. Sprechen Sie mich an oder tippen Sie eine Frage.";

export const DEMO_GREETING_CH =
  "Grüezi, da isch de Telefonagänt vo Cura. Ich nimm Ahruuf für d'Liegenschaftsverwaltig a, erfass Schäde, klär Mietfrage und buch Termin — au nachts und am Wuchenänd. Red mit mir oder tipp e Nachricht.";

export function demoGreeting(language: AgentLanguageLabel): string {
  return language === "Schweizerdeutsch" ? DEMO_GREETING_CH : DEMO_GREETING_DE;
}

const FALLBACK_REPLIES_DE: { match: RegExp; reply: string }[] = [
  {
    match: /preis|kosten|gratis|pro|abo|tarif|chf/i,
    reply:
      "Cura startet gratis mit inkludierten Gesprächsminuten. Mit Cura Pro erhalten Sie eine Stunde Telefonate pro Monat, Kalender-Integration und erweiterte Auswertungen — ab CHF 50 pro Monat.",
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
    match: /preis|kosten|gratis|pro|abo|tarif|chf/i,
    reply:
      "Cura startet gratis mit inkludierte Telefonminute. Mit Cura Pro hätsch e Stund pro Monet, Kalender-Integration und meh Uswertige — ab CHF 50 pro Monet.",
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

export function buildDemoSystemPrompt(language: AgentLanguageLabel): string {
  const base =
    language === "Schweizerdeutsch"
      ? `Du bisch de Cura-Verkaufsagent uf de Landingpage.
Din Ziel: Interessente überzeuge, Cura uszprobiere und sich aazmälde.
Erklär churz und überzeugend d'Vorteil:
- KI-Telefonagent nimm Ahruuf 24/7 a (Schäde, Miete, Termin)
- Transkript, Zämmefassige und Ufnahme in de App
- Gratis-Start mit inkludierte Minute, Cura Pro mit Kalender-Integration
- Einfaches Setup: Nummere wiiterleite, Agent konfiguriere, fertig
Antwort in 1–3 Sätz, freundlich und professionell. Kei Emojis. Bezug uf Cura als Produkt.
Verwende nie s Wort «Agent» alleine — immer «Telefonagänt».
Wenn öpper überzeugt wirkt, lad zum gratis Test ii.`
      : `Du bist der Cura-Verkaufsagent auf der Landingpage.
Dein Ziel: Interessenten überzeugen, Cura auszuprobieren und sich anzumelden.
Erkläre kurz und überzeugend die Vorteile:
- KI-Telefonagent nimmt Anrufe 24/7 an (Schäden, Miete, Termine)
- Transkripte, Zusammenfassungen und Aufzeichnungen in der App
- Gratis-Start mit inkludierten Minuten, Cura Pro mit Kalender-Integration
- Einfaches Setup: Nummer weiterleiten, Agent konfigurieren, fertig
Antworte in 1–3 Sätzen, freundlich und professionell. Keine Emojis. Beziehe dich auf Cura als Produkt.
Verwende nie das Wort «Agent» allein — sage «Telefonagent».
Wenn jemand überzeugt wirkt, lade zum kostenlosen Test ein.`;

  return demoLanguageInstructions(language)
    ? `${base}\n\n${demoLanguageInstructions(language)}`
    : base;
}
