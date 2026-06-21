import "server-only";

import type { ListedCalendarEvent } from "@/lib/calendar/types";
import { readCalendarMirrorRange } from "@/lib/integrations/calendar-mirror/store";
import type {
  CustomerDossier,
  DossierAppointment,
  DossierConcern,
  MatchedCustomer,
} from "@/lib/messages/inquiry-types";
import type { InboundMessage, MessageChannelType } from "@/lib/messages/types";
import { createClient, requireUserId } from "@/lib/supabase/server";

const HISTORY_PAST_DAYS = 540;
const HISTORY_FUTURE_DAYS = 180;
const MAX_PAST_APPTS = 8;
const MAX_UPCOMING_APPTS = 8;
const MAX_CONCERNS = 6;

const CRAFTSMAN_PATTERNS: Array<[RegExp, string]> = [
  [/sanit(ä|ae)r|klempner|rohr|wasser|leitung/i, "Sanitär"],
  [/elektr|strom|steckdose|sicherung/i, "Elektriker"],
  [/heizung|therme|brenner|kessel/i, "Heizung"],
  [/maler|streich|anstrich/i, "Maler"],
  [/schreiner|tischler|möbel|kasten|tür/i, "Schreiner"],
  [/boden|parkett|platten|fliesen/i, "Bodenleger"],
  [/lift|aufzug/i, "Lift-Service"],
  [/schlüssel|schluessel|schloss|zylinder/i, "Schlüssel/Schloss"],
  [/reinig|putz/i, "Reinigung"],
  [/garten|hauswart|umgebung/i, "Hauswart/Garten"],
];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}

function deriveCraftsman(event: ListedCalendarEvent): string | undefined {
  const text = `${event.title} ${event.description ?? ""}`;
  for (const [pattern, label] of CRAFTSMAN_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return undefined;
}

/** Conservative match of a calendar event to a customer (name/address/phone). */
function eventMatchesCustomer(
  event: ListedCalendarEvent,
  customer: MatchedCustomer
): boolean {
  const text = normalize(`${event.title} ${event.description ?? ""}`);
  if (!text) return false;

  const fullName = normalize(customer.name);
  if (fullName && text.includes(fullName)) return true;

  const tokens = fullName.split(" ").filter((token) => token.length >= 2);
  if (tokens.length >= 2 && tokens.every((token) => text.includes(token))) {
    return true;
  }

  const lastName = tokens[tokens.length - 1];
  const propertyLabel = normalize(customer.propertyLabel ?? "");
  if (lastName && lastName.length >= 4 && text.includes(lastName)) {
    // Last name alone is risky; require a property/address hint too unless rare.
    if (propertyLabel && text.includes(propertyLabel)) return true;
  }

  if (propertyLabel && propertyLabel.length >= 4 && text.includes(propertyLabel)) {
    return true;
  }

  const address = normalize(customer.address ?? "");
  if (address) {
    const addrTokens = address.split(" ").filter(Boolean);
    const streetToken = addrTokens.find(
      (token) => /strasse|str|weg|gasse|platz|allee|ring/.test(token) || token.length >= 6
    );
    const numberToken = addrTokens.find((token) => /^\d{1,4}[a-z]?$/.test(token));
    if (streetToken && numberToken && text.includes(streetToken) && text.includes(numberToken)) {
      return true;
    }
  }

  if (customer.phone) {
    const digits = customer.phone.replace(/\D/g, "").slice(-7);
    if (digits.length >= 6 && text.replace(/\D/g, "").includes(digits)) return true;
  }

  return false;
}

async function buildAppointmentHistory(
  userId: string,
  customer: MatchedCustomer
): Promise<DossierAppointment[]> {
  const now = Date.now();
  const startIso = new Date(now - HISTORY_PAST_DAYS * 86_400_000).toISOString();
  const endIso = new Date(now + HISTORY_FUTURE_DAYS * 86_400_000).toISOString();

  let events: ListedCalendarEvent[];
  try {
    events = await readCalendarMirrorRange(userId, startIso, endIso);
  } catch {
    return [];
  }

  const matched = events
    .filter((event) => eventMatchesCustomer(event, customer))
    .map((event) => {
      const when: "past" | "upcoming" =
        new Date(event.startIso).getTime() < now ? "past" : "upcoming";
      return {
        id: event.id,
        title: event.title || "Termin",
        startIso: event.startIso,
        endIso: event.endIso,
        cancelled: event.cancelled,
        agentCreated: event.agentCreated,
        when,
        craftsman: deriveCraftsman(event),
      } satisfies DossierAppointment;
    });

  const past = matched
    .filter((appt) => appt.when === "past")
    .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime())
    .slice(0, MAX_PAST_APPTS);
  const upcoming = matched
    .filter((appt) => appt.when === "upcoming")
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
    .slice(0, MAX_UPCOMING_APPTS);

  return [...upcoming, ...past];
}

/**
 * Past conversations from the same sender(s) on this channel (other threads),
 * enriched with any stored inquiry summary. Gives the bot "vergangene Anliegen".
 */
async function buildConcernHistory(
  userId: string,
  channelType: MessageChannelType,
  channelRef: string,
  senderAddresses: string[],
  excludeThreadId: string
): Promise<DossierConcern[]> {
  if (senderAddresses.length === 0) return [];
  const supabase = createClient();

  const { data: msgRows } = await supabase
    .from("inbound_messages")
    .select("thread_id, subject, body, preview, received_at, sender_address, direction")
    .eq("user_id", userId)
    .eq("channel_type", channelType)
    .eq("channel_ref", channelRef)
    .in("sender_address", senderAddresses)
    .order("received_at", { ascending: false })
    .limit(80);

  const byThread = new Map<
    string,
    { subject?: string; lastMessageAt: string; preview?: string }
  >();
  for (const row of msgRows ?? []) {
    const threadId = row.thread_id as string;
    if (threadId === excludeThreadId) continue;
    if (!byThread.has(threadId)) {
      byThread.set(threadId, {
        subject: (row.subject as string | null) ?? undefined,
        lastMessageAt: row.received_at as string,
        preview:
          (row.preview as string | null) ??
          ((row.body as string | null) ?? undefined)?.slice(0, 140),
      });
    }
  }

  const threadIds = Array.from(byThread.keys()).slice(0, MAX_CONCERNS);
  if (threadIds.length === 0) return [];

  const { data: inquiryRows } = await supabase
    .from("message_inquiries")
    .select("thread_id, summary, status")
    .eq("user_id", userId)
    .in("thread_id", threadIds);

  const inquiryByThread = new Map(
    (inquiryRows ?? []).map((row) => [row.thread_id as string, row])
  );

  return threadIds.map((threadId) => {
    const base = byThread.get(threadId)!;
    const inquiry = inquiryByThread.get(threadId);
    return {
      threadId,
      subject: base.subject,
      lastMessageAt: base.lastMessageAt,
      summary: (inquiry?.summary as string | null) ?? base.preview ?? undefined,
      status: (inquiry?.status as DossierConcern["status"]) ?? undefined,
    } satisfies DossierConcern;
  });
}

export async function buildCustomerDossiers(input: {
  matched: MatchedCustomer[];
  messages: InboundMessage[];
  channelType: MessageChannelType;
  channelRef: string;
  threadId: string;
}): Promise<CustomerDossier[]> {
  if (input.matched.length === 0) return [];
  const userId = await requireUserId();

  const senderAddresses = Array.from(
    new Set(
      input.messages
        .filter((message) => message.direction === "inbound" && message.senderAddress)
        .map((message) => message.senderAddress!.trim().toLowerCase())
    )
  );

  const dossiers: CustomerDossier[] = [];
  for (const customer of input.matched) {
    const [appointments, concerns] = await Promise.all([
      buildAppointmentHistory(userId, customer),
      buildConcernHistory(
        userId,
        input.channelType,
        input.channelRef,
        Array.from(
          new Set(
            [...senderAddresses, customer.email?.trim().toLowerCase()].filter(
              (value): value is string => Boolean(value)
            )
          )
        ),
        input.threadId
      ),
    ]);
    dossiers.push({ ...customer, appointments, concerns });
  }

  return dossiers;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Compact, token-efficient dossier rendering for the LLM prompt. */
export function formatDossiersForPrompt(dossiers: CustomerDossier[]): string {
  if (dossiers.length === 0) return "";

  const blocks = dossiers.map((dossier, index) => {
    const lines: string[] = [];
    lines.push(
      `Kunde ${index + 1}: ${dossier.name}${dossier.address ? ` · ${dossier.address}` : ""}${dossier.phone ? ` · Tel ${dossier.phone}` : ""}${dossier.email ? ` · ${dossier.email}` : ""}`
    );
    if (dossier.propertyLabel) lines.push(`  Objekt: ${dossier.propertyLabel}`);
    if (dossier.rentalInfo) lines.push(`  Mietverhältnis: ${dossier.rentalInfo}`);
    lines.push(`  Erkannt über: ${dossier.matchReason}`);

    const upcoming = dossier.appointments.filter((a) => a.when === "upcoming");
    const past = dossier.appointments.filter((a) => a.when === "past");
    if (upcoming.length > 0) {
      lines.push("  Kommende Termine:");
      for (const appt of upcoming) {
        lines.push(
          `    - ${formatDate(appt.startIso)} ${appt.title}${appt.craftsman ? ` [${appt.craftsman}]` : ""}${appt.cancelled ? " (storniert)" : ""}`
        );
      }
    }
    if (past.length > 0) {
      lines.push("  Frühere Termine / Handwerker:");
      for (const appt of past) {
        lines.push(
          `    - ${formatDate(appt.startIso)} ${appt.title}${appt.craftsman ? ` [${appt.craftsman}]` : ""}${appt.cancelled ? " (storniert)" : ""}`
        );
      }
    }
    if (dossier.concerns.length > 0) {
      lines.push("  Frühere Anliegen (andere Threads):");
      for (const concern of dossier.concerns) {
        lines.push(
          `    - ${formatDate(concern.lastMessageAt)} ${concern.subject ?? "(kein Betreff)"}${concern.summary ? `: ${concern.summary}` : ""}${concern.status ? ` [${concern.status}]` : ""}`
        );
      }
    }
    return lines.join("\n");
  });

  return `\n\nKUNDEN-DOSSIER (aus gespiegelter Datenbank & Kalender):\n${blocks.join("\n\n")}`;
}

/** Compact Handwerker list for Schadensmeldungen / contact_craftsman actions. */
export function formatCraftsmenForPrompt(
  records: Array<{
    name: string;
    trade?: string;
    phone?: string;
    email?: string;
    address?: string;
  }>
): string {
  if (records.length === 0) return "";

  const lines = records.map((record) => {
    const parts = [record.name];
    if (record.trade) parts.push(`Gewerk: ${record.trade}`);
    if (record.phone) parts.push(`Tel: ${record.phone}`);
    if (record.email) parts.push(`E-Mail: ${record.email}`);
    if (record.address) parts.push(`Adresse: ${record.address}`);
    return `- ${parts.join(" · ")}`;
  });

  return `\n\nHANDWERKER-STAMM (aus Daten-Quelle — für Schadensmeldungen & Gewerke):\n${lines.join("\n")}`;
}
