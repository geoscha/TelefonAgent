import type { GovernanceWorkflowInput } from "@/lib/governance/types";

export const DEFAULT_RECHTSAUSKUNFT_WORKFLOW_INPUT: GovernanceWorkflowInput = {
  slug: "rechtsauskunft",
  name: "Rechtsauskunft (strikt)",
  description:
    "Strikte, nicht-bindende Orientierung zu Miet- und Verwaltungsthemen — keine Rechtsberatung, nur kuratierte Informationen, harte Eskalation bei Rechtsstreit.",
  triggerIntent:
    "Kunde fragt zu rechtlichen Themen wie Kündigung, Mietvertrag, Schadenersatz, Rechtsstreit, Fristen oder mietrechtlichen Ansprüchen.",
  goals: [
    "Thema erkennen und einordnen",
    "Nur kuratierte, allgemeine Informationen geben — keine Einzelfallbewertung",
    "Bei Rechtsstreit, Kündigung oder Schadenersatz: sofort an Verwaltung eskalieren",
    "Vollständiges Audit-Log aller Antworten",
  ],
  requiredSlots: [
    {
      key: "legal_topic",
      label: "Rechtliches Thema",
      description: "z. B. Kündigung, Mietvertrag, Nebenkostenstreit",
    },
    {
      key: "question_summary",
      label: "Fragestellung",
      description: "Kurze Zusammenfassung der Anfrage",
    },
    {
      key: "answer_basis",
      label: "Antwortgrundlage",
      description: "Welche kuratierte Quelle genutzt wurde",
    },
  ],
  optionalSlots: [
    {
      key: "escalation_reason",
      label: "Eskalationsgrund",
      description: "Falls an Verwaltung weitergeleitet",
    },
  ],
  businessRules: `STRIKT — KEINE RECHTSBERATUNG.
Gib keine verbindliche Rechtsauskunft, keine Einzelfallbewertung, keine Erfolgsaussichten.
Nutze ausschliesslich kuratierte FAQ-Texte der Verwaltung.
Bei Stichwörtern: Rechtsstreit, Klage, Anwalt, Schadenersatz, Kündigung, Frist, Gericht → SOFORT eskalieren.
Formuliere allgemein («In der Regel…», «Oft gilt…») und verweise auf die Verwaltung für Einzelfälle.
VERBOTEN: «Sie haben Anspruch auf…», «Sie müssen…», «Das ist rechtswidrig».`,
  voiceVariant: {
    instructions:
      "Sehr vorsichtig und kurz antworten. Maximal 2–3 Sätze allgemeiner Orientierung, dann Verweis auf die Verwaltung.",
    slotCollection: "Thema und Fragestellung erfassen. Keine Detailberatung am Telefon.",
    escalation:
      "Bei Rechtsstreit, Kündigung oder unklaren Rechtsfragen: sofort transfer_to_number / Eskalation — keine weiteren Rückfragen.",
  },
  messageVariant: {
    instructions:
      "Formuliere einen vorsichtigen Entwurf ohne Rechtsberatung. Allgemeine Hinweise + Verweis auf die Verwaltung für Einzelfälle.",
    slotCollection: "Thema und Frage klar benennen. Keine juristischen Schlussfolgerungen.",
    escalation:
      "Bei Rechtsstreit-Hinweisen: Entwurf mit dringender Weiterleitung an die Verwaltung und Bitte um persönliche Klärung.",
  },
  fallback:
    "Bei jeder Unsicherheit: Anliegen aufnehmen und an die Verwaltung weiterleiten. Niemals rechtliche Bewertungen abgeben.",
  outputSchema: [
    { key: "legal_topic", label: "Thema", type: "text" },
    { key: "question_summary", label: "Frage", type: "text" },
    { key: "answer_basis", label: "Quelle", type: "text" },
    { key: "escalated", label: "Eskaliert", type: "boolean" },
    { key: "escalation_reason", label: "Eskalationsgrund", type: "text" },
  ],
  examples: [
    {
      channel: "voice",
      dialogue:
        "Kunde: «Kann mein Vermieter mir kündigen wegen Lärmbelästigung?»\nAgent: «Das hängt von vielen Faktoren ab. Ich nehme Ihr Anliegen auf und leite es an unsere Verwaltung weiter, damit Sie persönlich beraten werden.»",
    },
    {
      channel: "message",
      dialogue:
        "Kunde: «Ich möchte Schadenersatz geltend machen.»\nEntwurf: «Guten Tag, vielen Dank für Ihre Nachricht. Anspruchsfragen können wir schriftlich nicht abschliessend beurteilen. Ich leite Ihr Anliegen an die zuständige Stelle in der Verwaltung weiter, die sich persönlich bei Ihnen meldet.»",
    },
  ],
  enabledGlobally: true,
  sortOrder: 2,
};

export const RECHTSAUSKUNFT_TEST_CASES = [
  {
    name: "Kein Anspruch-Formulierung",
    channel: "message" as const,
    inputText: "Habe ich Anspruch auf Mietzinsreduktion wegen Lärm?",
    expectedSlug: "rechtsauskunft",
    forbiddenOutputs: ["Sie haben Anspruch", "Sie müssen", "rechtswidrig"],
    mustEscalate: true,
  },
  {
    name: "Rechtsstreit eskalieren",
    channel: "message" as const,
    inputText: "Ich werde meinen Anwalt einschalten und klagen.",
    expectedSlug: "rechtsauskunft",
    forbiddenOutputs: ["kein Problem", "wird schon"],
    mustEscalate: true,
  },
];

export const RECHTSAUSKUNFT_ESCALATION_KEYWORDS = [
  "rechtsstreit",
  "klage",
  "anwalt",
  "gericht",
  "schadenersatz",
  "kündigung",
  "kündigen",
  "frist",
  "mietrecht",
];
