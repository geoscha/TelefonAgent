export type PromptSections = {
  rolle: string;
  leistungen: string;
  typischeAnfragen: string;
  gespraechsfuehrung: string;
  eskalation: string;
  abschluss: string;
  branche: string;
  ziel: string;
  sonstiges: string;
};

export const PROMPT_SECTION_FIELDS: {
  key: keyof PromptSections;
  label: string;
  rows?: number;
}[] = [
  { key: "rolle", label: "Rolle", rows: 3 },
  { key: "leistungen", label: "Leistungen", rows: 4 },
  { key: "typischeAnfragen", label: "Typische Anfragen", rows: 4 },
  { key: "gespraechsfuehrung", label: "Gesprächsführung", rows: 4 },
  { key: "eskalation", label: "Eskalation", rows: 3 },
  { key: "abschluss", label: "Abschluss", rows: 3 },
  { key: "branche", label: "Branche", rows: 2 },
  { key: "ziel", label: "Ziel", rows: 2 },
  { key: "sonstiges", label: "Weitere Anweisungen", rows: 3 },
];

const EMPTY_SECTIONS = (): PromptSections => ({
  rolle: "",
  leistungen: "",
  typischeAnfragen: "",
  gespraechsfuehrung: "",
  eskalation: "",
  abschluss: "",
  branche: "",
  ziel: "",
  sonstiges: "",
});

const HEADER_TO_KEY: Record<string, keyof PromptSections> = {
  rolle: "rolle",
  "deine aufgaben": "leistungen",
  aufgaben: "leistungen",
  leistungen: "leistungen",
  "typische anfragen": "typischeAnfragen",
  "typische anliegen": "typischeAnfragen",
  anliegen: "typischeAnfragen",
  "gesprächsführung": "gespraechsfuehrung",
  gespraechsfuehrung: "gespraechsfuehrung",
  eskalation: "eskalation",
  abschluss: "abschluss",
  branche: "branche",
  ziel: "ziel",
  terminvereinbarung: "sonstiges",
  faq: "typischeAnfragen",
  "weitere anweisungen": "sonstiges",
  sprache: "sonstiges",
};

const LABEL_TO_KEY = Object.fromEntries(
  PROMPT_SECTION_FIELDS.map(({ key, label }) => [label.toLowerCase(), key])
) as Record<string, keyof PromptSections>;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^#+\s*/, "");
}

function mapHeader(title: string): keyof PromptSections {
  const norm = normalizeHeader(title);
  return HEADER_TO_KEY[norm] ?? LABEL_TO_KEY[norm] ?? "sonstiges";
}

function appendSection(
  sections: PromptSections,
  key: keyof PromptSections,
  content: string
) {
  const trimmed = content.trim();
  if (!trimmed) return;
  sections[key] = sections[key] ? `${sections[key]}\n\n${trimmed}` : trimmed;
}

/** Split stored prompt text into editable sections (supports legacy `#` headers). */
export function parseSystemPrompt(raw: string): PromptSections {
  const sections = EMPTY_SECTIONS();
  const text = raw.trim();
  if (!text) return sections;

  const lines = text.split("\n");
  let currentKey: keyof PromptSections | null = null;
  let buffer: string[] = [];

  function flush() {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }
    if (!currentKey) {
      appendSection(sections, "rolle", content);
    } else {
      appendSection(sections, currentKey, content);
    }
    buffer = [];
  }

  for (const line of lines) {
    const hashMatch = line.match(/^#\s+(.+)$/);
    if (hashMatch) {
      flush();
      currentKey = mapHeader(hashMatch[1]);
      continue;
    }

    const labelMatch = line.match(/^([^:\n]{2,40}):\s*$/);
    if (labelMatch) {
      flush();
      currentKey = mapHeader(labelMatch[1]);
      continue;
    }

    buffer.push(line);
  }

  flush();
  return sections;
}

/** Sections that belong in the knowledge base (not repeated on every LLM turn). */
export const KNOWLEDGE_PROMPT_SECTION_KEYS: (keyof PromptSections)[] = [
  "typischeAnfragen",
  "sonstiges",
];

/** Compose prompt for ElevenLabs without markdown `#` headers. */
export function composeSystemPrompt(sections: PromptSections): string {
  return PROMPT_SECTION_FIELDS.map(({ key, label }) => {
    const content = sections[key].trim();
    if (!content) return "";
    return `${label}:\n${content}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

/** Behavior-only prompt for live agents (excludes FAQ / reference sections). */
export function composeBehaviorSystemPrompt(sections: PromptSections): string {
  return PROMPT_SECTION_FIELDS.filter(
    ({ key }) => !KNOWLEDGE_PROMPT_SECTION_KEYS.includes(key)
  )
    .map(({ key, label }) => {
      const content = sections[key].trim();
      if (!content) return "";
      return `${label}:\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Reference text suitable for a knowledge-base document (not sent as prompt tokens). */
export function composeKnowledgeReferenceText(
  sections: PromptSections
): string | null {
  const chunks = KNOWLEDGE_PROMPT_SECTION_KEYS.map((key) => {
    const content = sections[key].trim();
    if (!content) return "";
    const label =
      PROMPT_SECTION_FIELDS.find((field) => field.key === key)?.label ?? key;
    return `${label}:\n${content}`;
  }).filter(Boolean);

  return chunks.length > 0 ? chunks.join("\n\n") : null;
}
