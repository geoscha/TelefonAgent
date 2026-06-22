import type {
  GovernanceChannelSettings,
  GovernanceDraftConfig,
  GovernanceGlobalRules,
  GovernanceToneVocabulary,
  GovernanceWorkflow,
  GovernanceWorkflowInput,
} from "@/lib/governance/types";
import { DEFAULT_RECHTSAUSKUNFT_WORKFLOW_INPUT } from "@/lib/workflow-engine/defaults";

export const DEFAULT_GLOBAL_RULES: GovernanceGlobalRules = {
  grounding: `Behaupte nur Fakten, die aus der Wissensbasis, Kundendaten oder dem laufenden Workflow-Kontext stammen.
Bei Unbekanntem: Anliegen aufnehmen, nachschauen lassen oder an einen Menschen übergeben — niemals etwas erfinden.
Keine verbindliche Rechtsberatung. Keine Zusagen ausserhalb der hinterlegten Policy.`,
  fallbackBehavior: `Wenn eine Information fehlt oder unklar ist, frage gezielt nach oder biete an, das Anliegen aufzunehmen und zu klären.
Formuliere Unsicherheit natürlich (z. B. «Ich nehme das gerne auf und lasse es prüfen»), nicht steif oder entschuldigend.`,
  privacy: `Gib keine personenbezogenen Daten an nicht verifizierte Anrufer oder unbekannte Absender heraus.
Verifiziere die Identität, bevor du sensible Kundendaten nennst.`,
  escalationGlobal: `Leite an einen Menschen weiter, wenn der Kunde es verlangt, bei Notfällen, bei rechtlich heiklen Themen oder wenn du das Anliegen nicht sicher lösen kannst.`,
};

export const DEFAULT_TONE_VOCABULARY: GovernanceToneVocabulary = {
  tonePrinciples: `Warm, knapp und professionell — schweiz-tauglich, ohne Roboter-Sprech.
Nutze die Sie-Form. Kurze Sätze, klare Struktur. Keine Floskeln oder Marketing-Sprache.`,
  toneExamples: [
    "«Gerne helfe ich Ihnen weiter. Um was geht es genau?»",
    "«Das nehme ich auf und leite es an die zuständige Stelle weiter.»",
    "«Können Sie mir noch kurz sagen, seit wann das Problem besteht?»",
  ],
  glossary: [
    {
      term: "Schadensmeldung",
      preferred: "Schadensmeldung / Schadenfall",
      avoid: ["Ticket", "Case", "Issue"],
    },
    {
      term: "Mietobjekt",
      preferred: "Mietobjekt / Wohnung / Liegenschaft",
      avoid: ["Unit", "Asset"],
    },
    {
      term: "Nebenkosten",
      preferred: "Nebenkosten / NK-Abrechnung",
      avoid: ["Utilities bill"],
    },
    {
      term: "Bewirtschafter",
      preferred: "Bewirtschafter / Verwaltung",
      avoid: ["Property manager (englisch)"],
    },
  ],
  forbiddenPhrases: [
    "Als KI-Modell kann ich…",
    "Ich bin nur ein Bot…",
    "Das liegt ausserhalb meines Wissens…",
  ],
};

export const DEFAULT_CHANNEL_SETTINGS: GovernanceChannelSettings = {
  voice: {
    liveResponseHints: `Antworte live und flüssig. Halte Antworten kurz (1–3 Sätze), bevor du nachfragst.
Bestätige wichtige Angaben mündlich, bevor du weitergehst.`,
    speechStyle: `Natürliches Sprechtempo. Keine Aufzählungen vorlesen. Eine Frage pro Schritt.`,
    transferRules: `Bei Notfall oder wenn der Anrufer eine Person verlangt: sofort weiterleiten, nicht lange erklären.`,
  },
  message: {
    suggestionMode: `Du schlägst Antwortentwürfe vor (Human-in-the-Loop). Formuliere klar als Vorschlag, nicht als gesendete Antwort.`,
    uncertaintyHints: `Kennzeichne Annahmen oder fehlende Informationen im Entwurf (z. B. «Falls die Adresse stimmt, …»).`,
    draftStyle: `Vollständige Sätze, kurze Anrede und Abschluss bei E-Mails. Bei WhatsApp etwas knapper, aber professionell.`,
  },
};

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceDraftConfig = {
  globalRules: DEFAULT_GLOBAL_RULES,
  toneVocabulary: DEFAULT_TONE_VOCABULARY,
  channelSettings: DEFAULT_CHANNEL_SETTINGS,
};

export const DEFAULT_DAMAGE_WORKFLOW_INPUT: GovernanceWorkflowInput = {
  slug: "schadensfall-meldung",
  name: "Schadensfall-Meldung",
  description:
    "Vollständige, strukturierte Schadenaufnahme mit Dringlichkeitseinstufung und Routing.",
  triggerIntent:
    "Anrufer oder Absender meldet einen Schaden, Defekt, Wasserschaden, Heizungsausfall oder ähnliches Problem.",
  goals: [
    "Alle Pflichtangaben erfassen",
    "Dringlichkeit korrekt einstufen",
    "Verantwortlichkeit (Mieter/Vermieter) grob klären",
    "Strukturierte Zusammenfassung für die Weiterbearbeitung erzeugen",
  ],
  requiredSlots: [
    { key: "name", label: "Name", description: "Name des Meldenden" },
    {
      key: "object_address",
      label: "Mietobjekt / Adresse",
      description: "Liegenschaft oder Wohnung",
    },
    { key: "damage_type", label: "Art des Schadens" },
    { key: "location", label: "Ort im Objekt" },
    { key: "since_when", label: "Seit wann" },
    { key: "urgency", label: "Dringlichkeit" },
    { key: "reachability", label: "Erreichbarkeit" },
  ],
  optionalSlots: [
    { key: "photos", label: "Fotos", description: "Besonders bei schriftlicher Meldung" },
  ],
  businessRules: `Notfall-Stichwörter (Wasserrohrbruch, Heizungsausfall, Gasgeruch, Lift eingeschlossen) → sofortige Eskalation.
OR-Verantwortungslogik: Verschleiss/Mieterverhalten oft Mietersache; Bausubstanz/Gemeinschaft oft Vermietersache — bei Unklarheit aufnehmen, nicht raten.
Pflichtangaben müssen vollständig sein, bevor der Workflow abgeschlossen wird.`,
  voiceVariant: {
    instructions:
      "Erfasse Angaben Schritt für Schritt. Bestätige Name, Adresse und Dringlichkeit mündlich.",
    slotCollection: "Eine Information pro Frage. Wiederhole kritische Angaben kurz zur Bestätigung.",
    escalation:
      "Bei Notfall-Stichwörtern: sofort an einen Menschen weiterleiten, keine langen Rückfragen.",
  },
  messageVariant: {
    instructions:
      "Formuliere einen vollständigen Entwurf zur Bestätigung. Frage nach Fotos als Anhang, wenn sinnvoll. Beantworte auch Ablauf-/Prozessfragen (z. B. «Wie reiche ich Fotos ein?») anhand der Wissensdatenbank oder mit dem Hinweis, Fotos als Antwort auf diese E-Mail zu senden.",
    slotCollection:
      "Liste fehlende Pflichtfelder klar auf. Nutze Aufzählungen nur für fehlende Angaben.",
    escalation:
      "Bei Notfall-Hinweisen im Text: Entwurf mit dringender Eskalation und Bitte um sofortigen Rückruf.",
  },
  fallback:
    "Wenn Angaben unklar sind: höflich nachfragen. Wenn Notfall vermutet: eskalieren. Niemals Dringlichkeit oder Verantwortlichkeit erfinden.",
  outputSchema: [
    { key: "name", label: "Name", type: "text" },
    { key: "object_address", label: "Adresse", type: "text" },
    { key: "damage_type", label: "Schadenart", type: "text" },
    { key: "location", label: "Ort", type: "text" },
    { key: "since_when", label: "Seit wann", type: "text" },
    { key: "urgency", label: "Dringlichkeit", type: "enum" },
    { key: "responsibility", label: "Verantwortlichkeit", type: "enum" },
    { key: "reachability", label: "Erreichbarkeit", type: "text" },
  ],
  examples: [
    {
      channel: "voice",
      dialogue:
        "Kunde: «Bei uns tropft es unter der Spüle.»\nAgent: «Das nehme ich auf. In welcher Liegenschaft oder Wohnung ist das? Und seit wann tropft es?»",
    },
    {
      channel: "message",
      dialogue:
        "Kunde: «Wie sollte ich die Fotos meiner Schadenmeldung einreichen?»\nEntwurf: «Guten Tag, vielen Dank für Ihre Nachricht. Sie können die Fotos zu Ihrer Schadenmeldung gerne als Anhang direkt auf diese E-Mail antworten. Bitte fügen Sie wenn möglich eine kurze Beschreibung und die betroffene Adresse bei. Wir leiten Ihre Unterlagen anschliessend an die zuständige Stelle weiter.»",
    },
    {
      channel: "message",
      dialogue:
        "Kunde: «Heizung funktioniert nicht.»\nEntwurf: «Guten Tag, vielen Dank für Ihre Meldung. Damit wir schnell helfen können, benötigen wir noch Ihre Adresse und seit wann die Heizung ausgefallen ist. Bei akutem Heizungsausfall melden wir das prioritär.»",
    },
  ],
  enabledGlobally: true,
  sortOrder: 0,
};

export const DEFAULT_GENERAL_INQUIRY_WORKFLOW_INPUT: GovernanceWorkflowInput = {
  slug: "allgemeine-auskunft",
  name: "Allgemeine Auskunft (Wissensdatenbank)",
  description:
    "Beantwortung allgemeiner Fragen anhand der hinterlegten Wissensdatenbank — mündlich am Telefon oder als Nachrichtenentwurf.",
  triggerIntent:
    "Kunde stellt eine allgemeine Informationsfrage zu Öffnungszeiten, Leistungen, Kontakt, Abläufen, Nebenkosten, Hausordnung oder ähnlichen Themen, die sich aus der Wissensdatenbank beantworten lassen — kein Schadenfall und kein Terminwunsch.",
  goals: [
    "Frage präzise verstehen und einem Wissensbereich zuordnen",
    "Antwort ausschliesslich aus der Wissensdatenbank (Website, FAQ, Betreiber-Infos) geben",
    "Am Telefon: mündlich, kurz und verständlich erklären",
    "Bei Nachrichten: vollständigen Antwortentwurf formulieren",
    "Bei fehlender Information: ehrlich sagen und Rückruf oder Nachverfolgung anbieten",
  ],
  requiredSlots: [
    {
      key: "inquiry_topic",
      label: "Thema der Anfrage",
      description: "Worum genau es geht",
    },
    {
      key: "answer_basis",
      label: "Antwortgrundlage",
      description: "Welche Wissensquelle genutzt wurde",
    },
  ],
  optionalSlots: [
    {
      key: "follow_up_needed",
      label: "Nachverfolgung nötig",
      description: "Falls die Frage nicht vollständig beantwortet werden konnte",
    },
  ],
  businessRules: `Nutze ausschliesslich Fakten aus der Wissensdatenbank (Betreiber-Website, Assistent-FAQ, hinterlegte Betreiber-Informationen).
Keine Spekulation, keine erfundenen Öffnungszeiten, Preise oder Policies.
Wenn die Wissensdatenbank die Frage nicht abdeckt: Anliegen aufnehmen und an einen Menschen weitergeben — nicht raten.
Dieser Workflow gilt nur, wenn eindeutig keine Schadensmeldung und kein Terminwunsch vorliegt.
Bei mehrteiligen Fragen: jeden Teil einzeln prüfen — beantworten, was klar in der Wissensdatenbank steht, Rest offen lassen.`,
  voiceVariant: {
    instructions:
      "Beantworte die Frage direkt und mündlich in 1–3 Sätzen. Nutze die Wissensdatenbank implizit — sage nicht «laut Wissensdatenbank».",
    slotCollection:
      "Falls unklar, stelle eine gezielte Rückfrage zum Thema, nicht zu Pflichtfeldern.",
    escalation:
      "Wenn die Antwort nicht in der Wissensdatenbank steht oder rechtlich/heikel ist: Anliegen aufnehmen und an einen Menschen weiterleiten.",
  },
  messageVariant: {
    instructions:
      "Formuliere einen vollständigen, versandfertigen Antwortentwurf mit Anrede und Abschluss. Formuliere Fakten aus der Wissensdatenbank natürlich um, nicht wörtlich zitieren.",
    slotCollection:
      "Falls Informationen fehlen, liste offene Punkte am Ende des Entwurfs auf.",
    escalation:
      "Wenn die Wissensdatenbank keine Antwort liefert: Entwurf mit Bitte um Rückmeldung durch die Verwaltung und Hinweis, dass die Anfrage weitergeleitet wird.",
  },
  fallback:
    "Bei Unsicherheit: ehrlich mitteilen, dass die Information nachgeprüft wird. Niemals etwas erfinden. Bei Wiederholungsfragen kurz bestätigen und ggf. Rückruf anbieten.",
  outputSchema: [
    { key: "inquiry_topic", label: "Thema", type: "text" },
    { key: "answer_basis", label: "Antwortgrundlage", type: "text" },
    { key: "fully_answered", label: "Vollständig beantwortet", type: "boolean" },
    { key: "follow_up_needed", label: "Nachverfolgung", type: "boolean" },
  ],
  examples: [
    {
      channel: "voice",
      dialogue:
        "Kunde: «Wie sind Ihre Öffnungszeiten?»\nAgent: «Wir sind montags bis freitags von 8 bis 12 und 14 bis 17 Uhr erreichbar. Kann ich Ihnen sonst noch weiterhelfen?»",
    },
    {
      channel: "message",
      dialogue:
        "Kunde: «Wo finde ich Informationen zur Nebenkostenabrechnung?»\nEntwurf: «Guten Tag, vielen Dank für Ihre Nachricht. Die Nebenkostenabrechnung erhalten Sie jährlich per Post und auf Wunsch zusätzlich per E-Mail. Detaillierte Informationen finden Sie auch auf unserer Website unter «Mieterservice». Bei konkreten Fragen zu Ihrer Abrechnung helfen wir Ihnen gerne persönlich weiter.»",
    },
  ],
  enabledGlobally: true,
  sortOrder: 1,
};

export const DEFAULT_GOVERNANCE_WORKFLOWS: GovernanceWorkflowInput[] = [
  DEFAULT_DAMAGE_WORKFLOW_INPUT,
  DEFAULT_GENERAL_INQUIRY_WORKFLOW_INPUT,
  DEFAULT_RECHTSAUSKUNFT_WORKFLOW_INPUT,
];

export function emptyWorkflowChannelVariant() {
  return { instructions: "", slotCollection: "", escalation: "" };
}

export function emptyWorkflowInput(): GovernanceWorkflowInput {
  return {
    slug: "",
    name: "",
    description: "",
    triggerIntent: "",
    goals: [""],
    requiredSlots: [{ key: "", label: "" }],
    optionalSlots: [],
    businessRules: "",
    voiceVariant: emptyWorkflowChannelVariant(),
    messageVariant: emptyWorkflowChannelVariant(),
    fallback: "",
    outputSchema: [],
    examples: [],
    enabledGlobally: true,
    sortOrder: 0,
  };
}

export function normalizeWorkflow(
  row: Record<string, unknown>
): GovernanceWorkflow {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    triggerIntent: String(row.trigger_intent ?? row.triggerIntent ?? ""),
    goals: Array.isArray(row.goals) ? (row.goals as string[]) : [],
    requiredSlots: Array.isArray(row.required_slots ?? row.requiredSlots)
      ? ((row.required_slots ?? row.requiredSlots) as GovernanceWorkflow["requiredSlots"])
      : [],
    optionalSlots: Array.isArray(row.optional_slots ?? row.optionalSlots)
      ? ((row.optional_slots ?? row.optionalSlots) as GovernanceWorkflow["optionalSlots"])
      : [],
    businessRules: String(row.business_rules ?? row.businessRules ?? ""),
    voiceVariant: (row.voice_variant ?? row.voiceVariant ?? {}) as GovernanceWorkflow["voiceVariant"],
    messageVariant: (row.message_variant ?? row.messageVariant ?? {}) as GovernanceWorkflow["messageVariant"],
    fallback: String(row.fallback ?? ""),
    outputSchema: Array.isArray(row.output_schema ?? row.outputSchema)
      ? ((row.output_schema ?? row.outputSchema) as GovernanceWorkflow["outputSchema"])
      : [],
    examples: Array.isArray(row.examples)
      ? (row.examples as GovernanceWorkflow["examples"])
      : [],
    enabledGlobally: Boolean(row.enabled_globally ?? row.enabledGlobally ?? true),
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  };
}
