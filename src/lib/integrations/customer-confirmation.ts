/** Examples shown to the agent — not an exhaustive allowlist. */
export const CUSTOMER_AFFIRMATION_EXAMPLES = [
  "ja",
  "jo",
  "genau",
  "passt",
  "passt mir",
  "einverstanden",
  "gerne",
  "klar",
  "alles klar",
  "super",
  "perfekt",
  "wunderbar",
  "ok",
  "okay",
  "machen wir",
  "nehmen wir",
  "das passt",
  "klingt gut",
  "isch guet",
  "passt scho",
] as const;

export const CUSTOMER_CONFIRMATION_PROMPT = `### Kundenbestätigung (flexibel verstehen)
- Jede **klare Zustimmung** zählt als Bestätigung — nicht nur «ja».
- Beispiele: ${CUSTOMER_AFFIRMATION_EXAMPLES.join(", ")}.
- Auch indirekt: «das passt mir», «klingt gut», «machen wir so», «den nehme ich», «super, danke».
- Schweizerdeutsch verstehen: «jo», «passt scho», «isch guet», «gärn».
- Bei klarer Zustimmung **oder** wenn der Kunde den Wunschtermin bereits genannt hat und der Slot frei ist: Termin **mündlich bestätigen** — bei Telefonanrufen wird er nach dem Gespräch automatisch eingetragen.
- Sage «notiert» oder «vereinbart», nicht «im Kalender eingetragen» während des Anrufs.
- Bei Unklarheit oder Ablehnung («nein», «lieber nicht», «passt nicht»): kurz nachfragen oder Alternativen anbieten.`;

const REJECTION_PATTERNS = [
  /\b(nein|nee|nö|nope|lieber\s+nicht|nicht\s+davon|geht\s+nicht|passt\s+(?:mir\s+)?nicht|will\s+(?:ich\s+)?nicht|kein(?:e|en)?\s+termin)\b/i,
];

const AFFIRMATION_PATTERNS = [
  /\b(ja|jo|jep|jup|jawohl|jawoll)\b/i,
  /\b(genau|exakt|stimmt|richtig)\b/i,
  /\b(passt(?:\s+(?:mir|gut|super|scho|scho\s+so))?|das\s+passt)\b/i,
  /\b(einverstanden|in\s+ordnung)\b/i,
  /\b(okay?|okey)\b/i,
  /\b(gerne|gärn|sehr\s+gerne|gerne\s+doch)\b/i,
  /\b(klar|alles\s+klar|isch\s+guet|passt\s+scho)\b/i,
  /\b(super|perfekt|toll|wunderbar|fein|prima|ausgezeichnet)\b/i,
  /\b(sicher|natürlich|selbstverständlich)\b/i,
  /\b(bestätige?|bestätigt|mach(?:en)?\s+wir|nehmen?\s+wir|nehme?\s+ich|buch(?:en)?\s+(?:wir|den|mir)?)\b/i,
  /\b(das\s+geht|geht\s+klar|klingt\s+gut|hört\s+sich\s+gut\s+an|so\s+ist\s+gut)\b/i,
];

const APPOINTMENT_CONTEXT_PATTERNS = [
  /verfügbar/i,
  /frei/i,
  /\btermin\b/i,
  /behandlung/i,
  /haareschneiden/i,
  /haarschnitt/i,
  /buch/i,
  /reserv/i,
  /eingetragen/i,
  /\d{1,2}\s*(?::\d{2})?\s*uhr/i,
  /\d{1,2}\.\s*(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)/i,
];

export function isCustomerRejection(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return REJECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isCustomerAffirmation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isCustomerRejection(trimmed)) return false;
  return AFFIRMATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function hasAppointmentConversationContext(text: string): boolean {
  return APPOINTMENT_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

/** True when the caller clearly agreed to a proposed appointment slot. */
export function isConfirmedAppointmentExchange(
  transcriptText: string
): boolean {
  const lower = transcriptText.toLowerCase();
  if (!hasAppointmentConversationContext(lower)) return false;

  const callerLines = transcriptText
    .split(/\n|(?=(?:Anrufer|Kunde|User|Caller):)/i)
    .map((line) => line.replace(/^(Anrufer|Kunde|User|Caller):\s*/i, "").trim())
    .filter(Boolean);

  const callerText = callerLines.length > 0 ? callerLines.join(" ") : lower;
  return isCustomerAffirmation(callerText) || isCustomerAffirmation(lower);
}

const AGENT_CONFIRMATION_PATTERNS = [
  /termin\s+(?:ist\s+)?(?:notiert|vereinbart|bestätigt|reserviert|gebucht|eingetragen)/i,
  /(?:notiert|vereinbart|bestätigt|reserviert|eingetragen)\s+.*\btermin\b/i,
  /wir\s+haben\s+(?:das|den\s+termin)/i,
  /haben\s+(?:das|den)\s+notiert/i,
  /perfekt,?\s+.*\btermin\b/i,
  /(?:ihr|dein|ihnen)\s+termin\s+(?:am|für|ist)/i,
  /bis\s+(?:dann|dahin|zum\s+termin)/i,
  /(?:der\s+)?slot\s+ist\s+frei/i,
  /\bnotiert\b/i,
  /vereinbart\s+.*\bam\b/i,
  /(?:dann|schön)\s+.*\bam\s+\d/i,
  /wir\s+sehen\s+uns/i,
  /freut\s+mich.*\bam\b/i,
  /alles\s+klar.*\bam\b/i,
  /(?:also|perfekt|super|wunderbar),?\s+[^.]{0,80}\bam\s+\d/i,
];

/** Agent recap lines that typically contain the final slot. */
const AGENT_RECAP_HINT =
  /(?:notiert|vereinbart|bestätigt|reserviert|perfekt|super|alles\s+klar|also|wunderbar)/i;

export function agentConfirmedAppointment(
  transcript: Array<{ speaker: string; text: string }>
): boolean {
  const agentText = transcript
    .filter((line) => line.speaker === "Agent")
    .map((line) => line.text)
    .join(" ");
  return AGENT_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(agentText));
}

/** Text from the agent's final confirmation / recap (best source for date/time). */
export function extractAgentRecapText(
  transcript: Array<{ speaker: string; text: string }>
): string {
  const agentLines = transcript
    .filter((line) => line.speaker === "Agent")
    .map((line) => line.text.trim())
    .filter(Boolean);

  for (let i = agentLines.length - 1; i >= 0; i -= 1) {
    if (AGENT_RECAP_HINT.test(agentLines[i])) {
      return agentLines[i];
    }
  }

  return agentLines.slice(-2).join(" ");
}

/** Binding commitment: agent confirmed a slot — calendar write is mandatory. */
export function isBindingAppointmentCommitment(
  transcript: Array<{ speaker: string; text: string }>
): boolean {
  if (!agentConfirmedAppointment(transcript)) return false;

  const text = transcript.map((line) => line.text).join(" ").toLowerCase();
  if (!hasAppointmentConversationContext(text)) return false;

  const callerText = transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => line.text)
    .join(" ");
  if (callerText && isCustomerRejection(callerText)) return false;

  return true;
}

/** True when a post-call calendar write is appropriate. */
export function hasBookableAppointmentInTranscript(
  transcript: Array<{ speaker: string; text: string }>
): boolean {
  const transcriptText = transcript
    .map((line) => `${line.speaker}: ${line.text}`)
    .join("\n");
  const lower = transcriptText.toLowerCase();

  if (!hasAppointmentConversationContext(lower)) return false;

  const callerText = transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => line.text)
    .join(" ");
  if (callerText && isCustomerRejection(callerText)) return false;

  if (isConfirmedAppointmentExchange(transcriptText)) return true;
  if (isBindingAppointmentCommitment(transcript)) return true;

  // Agent recap with date/time counts as commitment even without explicit «ja».
  if (
    /\d{1,2}\.?\s*(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)/i.test(
      lower
    ) &&
    /\d{1,2}\s*(?::\d{2})?\s*uhr|\bum\s+\d{1,2}/i.test(lower) &&
    agentConfirmedAppointment(transcript)
  ) {
    return true;
  }

  return false;
}
