import type {
  MatchedInquiryWorkflow,
  MessageInquiryCategory,
} from "@/lib/messages/inquiry-types";

const WORKFLOW_LABEL_BY_SLUG: Record<string, string> = {
  "schadensfall-meldung": "Schadensfall-Meldung",
  "allgemeine-auskunft": "Allgemeine Auskunft",
};

const TEXT_WORKFLOW_HINTS: Array<{ pattern: RegExp; slug: string }> = [
  {
    pattern:
      /schaden|defekt|kaputt|undicht|wasser|tropf|leck|rohrbruch|heizung|schimmel|notfall|gas|feuer|brand|reparatur/i,
    slug: "schadensfall-meldung",
  },
  {
    pattern:
      /öffnungszeit|information|auskunft|frage|kontakt|hausordnung|nebenkosten|miete|mietzins|vertrag|website|leistung|preis|kosten|adresse|email|telefon|faq/i,
    slug: "allgemeine-auskunft",
  },
];

function labelFromCategory(category?: MessageInquiryCategory): string | undefined {
  switch (category) {
    case "Schadenmeldung":
    case "Notfall":
      return WORKFLOW_LABEL_BY_SLUG["schadensfall-meldung"];
    case "Allgemein":
    case "Vertrag/Miete":
      return WORKFLOW_LABEL_BY_SLUG["allgemeine-auskunft"];
    default:
      return undefined;
  }
}

function labelFromText(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  for (const hint of TEXT_WORKFLOW_HINTS) {
    if (hint.pattern.test(text)) {
      return WORKFLOW_LABEL_BY_SLUG[hint.slug];
    }
  }
  return undefined;
}

export function resolveInquiryWorkflowLabel(input: {
  matchedWorkflow?: MatchedInquiryWorkflow;
  category?: MessageInquiryCategory;
  text?: string;
}): string {
  if (input.matchedWorkflow?.name?.trim()) {
    return input.matchedWorkflow.name.trim();
  }

  if (input.matchedWorkflow?.slug) {
    const fromSlug = WORKFLOW_LABEL_BY_SLUG[input.matchedWorkflow.slug];
    if (fromSlug) return fromSlug;
  }

  return (
    labelFromCategory(input.category) ??
    labelFromText(input.text) ??
    "unklar"
  );
}
