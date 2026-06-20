export const LINKER_CALENDAR_LABEL = "Linker";
/** @deprecated Use LINKER_CALENDAR_LABEL — kept for backwards-compatible detection. */
export const AGENT_CALENDAR_SOURCE_LABEL = "Linker Agent";
export const AGENT_CREATED_DESCRIPTION = "Vom Linker Telefonagenten erstellt.";
export const AGENT_CANCELLED_DESCRIPTION_PREFIX =
  "Abgesagt vom Linker Telefonagenten";

const CANCELLED_TITLE_PREFIX = `[Abgesagt · ${LINKER_CALENDAR_LABEL}]`;

/** Clean calendar title: «Termin — Max Müller» (label lives in CATEGORIES). */
export function formatAppointmentTitle(
  appointmentTypeLabel: string,
  attendeeName: string
): string {
  const type = appointmentTypeLabel.trim() || "Termin";
  const name = attendeeName.trim();
  return name ? `${type} — ${name}` : type;
}

/** @deprecated Prefer formatAppointmentTitle — kept for cancel flow title rewrites. */
export function formatAgentBookedTitle(title: string): string {
  return title.trim();
}

export function formatAgentCancelledTitle(title: string): string {
  const stripped = title
    .replace(/^\[(?:Abgesagt\s*·\s*)?(?:Cura|Linker(?: Agent)?)\]\s*/i, "")
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
    title.includes(LINKER_CALENDAR_LABEL) ||
    title.includes("Cura") ||
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
