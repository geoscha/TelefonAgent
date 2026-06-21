import type { CustomerRecord } from "@/lib/customers/types";
import type {
  CraftsmanEmailDraft,
  MessageInquiryCategory,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import type { InboundMessage } from "@/lib/messages/types";

const TRADE_KEYWORDS: Array<{ pattern: RegExp; trades: string[] }> = [
  {
    pattern: /heizung|heizkörper|heizkoerper|thermostat|wärme|waerme/i,
    trades: ["heizung", "sanitär", "sanitar"],
  },
  {
    pattern: /wasser|undicht|tropf|leck|rohr|abfluss|wc|toilette|bad|sanit/i,
    trades: ["sanitär", "sanitar", "klempner", "installateur"],
  },
  {
    pattern: /fenster|glas|tür|tuer|rollladen|jalousie/i,
    trades: ["fenster", "glas", "schreiner", "tischler"],
  },
  {
    pattern: /lift|aufzug/i,
    trades: ["lift", "aufzug"],
  },
  {
    pattern: /schimmel|feucht/i,
    trades: ["schimmel", "sanierung", "maler"],
  },
  {
    pattern: /strom|elektr|licht|steckdose|sicherung/i,
    trades: ["elektro", "elektriker"],
  },
  {
    pattern: /schloss|schlüssel|schluessel|türschloss/i,
    trades: ["schloss", "schreiner", "sicherheit"],
  },
];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTrade(value: string): string {
  return value.trim().toLowerCase();
}

function craftsmenWithEmail(records: CustomerRecord[]): CustomerRecord[] {
  return records.filter((record) => record.email?.trim());
}

export function pickCraftsmanForDamage(
  craftsmen: CustomerRecord[],
  text: string
): CustomerRecord | null {
  const candidates = craftsmenWithEmail(craftsmen);
  if (candidates.length === 0) return null;

  for (const entry of TRADE_KEYWORDS) {
    if (!entry.pattern.test(text)) continue;
    const match = candidates.find((record) => {
      const trade = normalizeTrade(record.trade ?? "");
      return entry.trades.some((needle) => trade.includes(needle));
    });
    if (match) return match;
  }

  return candidates[0] ?? null;
}

function findCraftsmanByEmail(
  craftsmen: CustomerRecord[],
  email: string
): CustomerRecord | undefined {
  const needle = normalizeEmail(email);
  return craftsmen.find(
    (record) => record.email && normalizeEmail(record.email) === needle
  );
}

function findCraftsmanByName(
  craftsmen: CustomerRecord[],
  name: string
): CustomerRecord | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return craftsmen.find((record) => record.name.trim().toLowerCase() === needle);
}

function resolveCraftsmanRecipient(
  raw: { recipient_name?: string; recipient_email?: string; trade?: string },
  craftsmen: CustomerRecord[]
): Pick<CraftsmanEmailDraft, "craftsmanId" | "recipientName" | "recipientEmail" | "trade"> | null {
  const email = raw.recipient_email?.trim();
  const name = raw.recipient_name?.trim();

  if (email) {
    const byEmail = findCraftsmanByEmail(craftsmen, email);
    if (byEmail?.email) {
      return {
        craftsmanId: byEmail.id,
        recipientName: byEmail.name,
        recipientEmail: byEmail.email.trim(),
        trade: byEmail.trade ?? raw.trade?.trim(),
      };
    }
  }

  if (name) {
    const byName = findCraftsmanByName(craftsmen, name);
    if (byName?.email) {
      return {
        craftsmanId: byName.id,
        recipientName: byName.name,
        recipientEmail: byName.email.trim(),
        trade: byName.trade ?? raw.trade?.trim(),
      };
    }
  }

  return null;
}

export function parseCraftsmanDrafts(
  raw: unknown,
  craftsmen: CustomerRecord[]
): CraftsmanEmailDraft[] {
  if (!Array.isArray(raw)) return [];

  const drafts: CraftsmanEmailDraft[] = [];
  raw.slice(0, 3).forEach((entry, index) => {
    const item = entry as {
      recipient_name?: string;
      recipient_email?: string;
      trade?: string;
      subject?: string;
      body?: string;
    };
    const body = item.body?.trim();
    const subject = item.subject?.trim();
    if (!body || !subject) return;

    const recipient = resolveCraftsmanRecipient(item, craftsmen);
    if (!recipient) return;

    drafts.push({
      id: `craft-${Date.now()}-${index}`,
      ...recipient,
      subject,
      body,
      status: "pending",
    });
  });

  return drafts;
}

function damageSummaryFromThread(messages: InboundMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.direction === "inbound");
  const body = latest?.body?.trim();
  if (!body) return "Schadenmeldung — Details siehe unten.";
  return body.length > 500 ? `${body.slice(0, 497)}…` : body;
}

function propertyHint(
  matchedAddress?: string,
  messages?: InboundMessage[]
): string {
  if (matchedAddress?.trim()) return matchedAddress.trim();
  const latest = messages
    ? [...messages].reverse().find((message) => message.direction === "inbound")
    : undefined;
  return latest?.subject?.trim() || "Liegenschaft (Adresse siehe Mieterkontext)";
}

export function buildHeuristicCraftsmanDraft(input: {
  messages: InboundMessage[];
  craftsmen: CustomerRecord[];
  category?: MessageInquiryCategory;
  customerName?: string;
  customerAddress?: string;
}): CraftsmanEmailDraft | null {
  const text = input.messages.map((message) => message.body).join("\n");
  const craftsman = pickCraftsmanForDamage(input.craftsmen, text);
  if (!craftsman?.email?.trim()) return null;

  const damage = damageSummaryFromThread(input.messages);
  const location = propertyHint(input.customerAddress, input.messages);
  const categoryLabel =
    input.category === "Notfall" ? "Notfall / dringend" : "Schadenmeldung";

  return {
    id: `craft-${Date.now()}-0`,
    craftsmanId: craftsman.id,
    recipientName: craftsman.name,
    recipientEmail: craftsman.email.trim(),
    trade: craftsman.trade,
    subject: `${categoryLabel}: ${location}`,
    body: `Guten Tag ${craftsman.name.split(/\s+/)[0] || craftsman.name}

wir melden folgendes Anliegen (${categoryLabel.toLowerCase()}) in der Liegenschaft ${location}:

${damage}

${input.customerName ? `Mieter/Kontakt: ${input.customerName}\n` : ""}Bitte melden Sie sich bei uns für die Terminabstimmung.

Freundliche Grüsse
Ihre Liegenschaftsverwaltung`,
    status: "pending",
  };
}

export function needsCraftsmanOutreach(input: {
  category?: MessageInquiryCategory;
  suggestedActions: MessageSuggestedAction[];
}): boolean {
  if (input.category === "Schadenmeldung" || input.category === "Notfall") {
    return true;
  }
  return input.suggestedActions.some(
    (action) =>
      action.type === "contact_craftsman" || action.type === "schedule_repair"
  );
}

export function enrichCraftsmanDrafts(input: {
  craftsmanDrafts: CraftsmanEmailDraft[];
  messages: InboundMessage[];
  craftsmen: CustomerRecord[];
  category?: MessageInquiryCategory;
  suggestedActions: MessageSuggestedAction[];
  customerName?: string;
  customerAddress?: string;
}): CraftsmanEmailDraft[] {
  if (input.craftsmanDrafts.length > 0) return input.craftsmanDrafts;
  if (!needsCraftsmanOutreach(input)) return [];

  const heuristic = buildHeuristicCraftsmanDraft(input);
  return heuristic ? [heuristic] : [];
}
