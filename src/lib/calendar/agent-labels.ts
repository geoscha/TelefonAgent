export const AGENT_CALENDAR_SOURCE_LABEL = "Cura Agent";
export const AGENT_CREATED_DESCRIPTION = "Vom Cura Telefonagenten erstellt.";
export const AGENT_CANCELLED_DESCRIPTION_PREFIX =
  "Abgesagt vom Cura Telefonagenten";

const BOOKED_TITLE_PREFIX = `[${AGENT_CALENDAR_SOURCE_LABEL}]`;
const CANCELLED_TITLE_PREFIX = `[Abgesagt · ${AGENT_CALENDAR_SOURCE_LABEL}]`;

export function formatAgentBookedTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return BOOKED_TITLE_PREFIX;
  if (
    trimmed.startsWith(BOOKED_TITLE_PREFIX) ||
    trimmed.startsWith(CANCELLED_TITLE_PREFIX)
  ) {
    return trimmed;
  }
  return `${BOOKED_TITLE_PREFIX} ${trimmed}`;
}

export function formatAgentCancelledTitle(title: string): string {
  const stripped = title
    .replace(/^\[(?:Abgesagt\s*·\s*)?Cura Agent\]\s*/i, "")
    .trim();
  return `${CANCELLED_TITLE_PREFIX} ${stripped || title.trim()}`;
}

export function buildAgentBookedDescription(lines: string[]): string {
  const body = lines.filter(Boolean).join("\n");
  return body.includes(AGENT_CREATED_DESCRIPTION)
    ? body
    : `${body}\n${AGENT_CREATED_DESCRIPTION}`.trim();
}

export function buildAgentCancelledDescription(
  existingDescription: string | undefined,
  cancelledAtIso: string
): string {
  const cancelledAt = new Date(cancelledAtIso).toLocaleString("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  });
  const marker = `${AGENT_CANCELLED_DESCRIPTION_PREFIX} am ${cancelledAt}.`;
  const base = existingDescription?.trim() ?? AGENT_CREATED_DESCRIPTION;
  if (base.includes(AGENT_CANCELLED_DESCRIPTION_PREFIX)) return base;
  return `${base}\n${marker}`.trim();
}

export function isAgentCreatedCalendarEvent(
  title: string,
  description?: string
): boolean {
  return (
    title.includes(AGENT_CALENDAR_SOURCE_LABEL) ||
    Boolean(description?.includes(AGENT_CREATED_DESCRIPTION))
  );
}

export function isCancelledCalendarEvent(
  title: string,
  status?: string
): boolean {
  return (
    status?.toUpperCase() === "CANCELLED" ||
    /^\[Abgesagt/i.test(title.trim())
  );
}
