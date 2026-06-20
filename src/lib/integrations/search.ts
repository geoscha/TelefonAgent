export type IntegrationSearchCategory = "calendar" | "mail";

export interface IntegrationSearchTarget {
  category: IntegrationSearchCategory;
  id: string;
  name: string;
  description: string;
  extra?: string;
}

const CATEGORY_SEARCH_TERMS: Record<IntegrationSearchCategory, string[]> = {
  calendar: [
    "kalender",
    "calendar",
    "termin",
    "termine",
    "appointment",
    "appointments",
    "icloud",
  ],
  mail: [
    "mail",
    "e-mail",
    "email",
    "post",
    "postfach",
    "inbox",
    "nachricht",
  ],
};

const ITEM_SEARCH_TERMS: Record<IntegrationSearchCategory, Record<string, string[]>> = {
  calendar: {
    google: ["google", "gcal", "workspace"],
    microsoft: ["microsoft", "outlook", "office", "365", "m365"],
    apple: ["apple", "icloud", "ios"],
  },
  mail: {
    gmail: ["gmail", "google", "workspace"],
    outlook: ["outlook", "microsoft", "office", "365", "hotmail", "live"],
    apple_mail: ["apple", "icloud", "ios", "mac"],
  },
};

function normalizeSearchQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function tokenizeQuery(value: string): string[] {
  return normalizeSearchQuery(value)
    .split(/[\s,+/]+/)
    .map((token) => token.replace(/[^\da-z@.-]/g, ""))
    .filter(Boolean);
}

function matchesCategoryQuery(
  tokens: string[],
  category: IntegrationSearchCategory
): boolean {
  if (tokens.length === 0) return false;

  const categoryTerms = CATEGORY_SEARCH_TERMS[category];

  return tokens.every((token) =>
    categoryTerms.some(
      (term) =>
        term === token ||
        term.includes(token) ||
        token.includes(term)
    )
  );
}

export function matchesIntegrationSearch(
  query: string,
  target: IntegrationSearchTarget
): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  if (matchesCategoryQuery(tokens, target.category)) {
    return true;
  }

  const haystack = normalizeSearchQuery(
    [
      target.name,
      target.description,
      target.extra ?? "",
      ...CATEGORY_SEARCH_TERMS[target.category],
      ...(ITEM_SEARCH_TERMS[target.category][target.id] ?? []),
    ].join(" ")
  );

  return tokens.every((token) => haystack.includes(token));
}

export function integrationSearchHasResults(query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  const staticTargets: IntegrationSearchTarget[] = [
    {
      category: "calendar",
      id: "google",
      name: "Google Kalender",
      description: "",
    },
    {
      category: "calendar",
      id: "microsoft",
      name: "Microsoft Outlook",
      description: "",
    },
    {
      category: "calendar",
      id: "apple",
      name: "Apple Kalender",
      description: "",
    },
    {
      category: "mail",
      id: "gmail",
      name: "Gmail",
      description: "",
    },
    {
      category: "mail",
      id: "outlook",
      name: "Outlook Mail",
      description: "",
    },
    {
      category: "mail",
      id: "apple_mail",
      name: "Apple Mail",
      description: "",
    },
  ];

  return staticTargets.some((target) => matchesIntegrationSearch(query, target));
}
