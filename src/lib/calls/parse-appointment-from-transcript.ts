import { DEFAULT_TZ } from "@/lib/calendar";
import { extractAgentRecapText } from "@/lib/integrations/customer-confirmation";
import type { TranscriptLine } from "@/lib/types";

const WEEKDAY_INDEX: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  so: 0,
  mo: 1,
  di: 2,
  mi: 3,
  do: 4,
  fr: 5,
  sa: 6,
};

const MONTHS: Record<string, number> = {
  januar: 0,
  februar: 1,
  maerz: 2,
  märz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
};

const TYPE_SYNONYMS: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  {
    id: "termin",
    label: "Termin",
    patterns: [/termin/i, /appointment/i, /buchung/i],
  },
  {
    id: "tischreservation",
    label: "Tischreservation",
    patterns: [/tisch/i, /reservation/i, /reservierung/i],
  },
  {
    id: "werkstatttermin",
    label: "Werkstatttermin",
    patterns: [/werkstatt/i, /service/i, /reparatur/i, /inspektion/i],
  },
  {
    id: "behandlung",
    label: "Behandlung",
    patterns: [
      /behandlung/i,
      /coiffeur/i,
      /frisör/i,
      /friseur/i,
      /salon/i,
      /kosmetik/i,
    ],
  },
  {
    id: "haareschneiden",
    label: "Haareschneiden",
    patterns: [/haareschneiden/i, /haarschnitt/i, /haare\s+schneiden/i, /schnitt/i],
  },
];

function normalizeMonthToken(token: string): string {
  return token.toLowerCase().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Rough CEST/CET offset for Europe/Zurich without extra dependencies. */
function zurichOffset(monthIndex: number): string {
  return monthIndex >= 2 && monthIndex <= 9 ? "+02:00" : "+01:00";
}

function buildZurichIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${zurichOffset(monthIndex)}`;
}

function capitalizeName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function extractAttendeeNameFromCallerLines(
  transcript: TranscriptLine[],
  callerName?: string
): string | undefined {
  const trimmedCaller = callerName?.trim();
  if (trimmedCaller) return trimmedCaller;

  const callerLines = transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => line.text.trim())
    .filter(Boolean);

  for (const text of callerLines) {
    const word = text.replace(/[.,!?]+$/g, "").trim();
    if (/^[A-Za-zÄÖÜäöüß]{2,30}$/.test(word) && !/^(ja|jo|nein|ok|okay)$/i.test(word)) {
      return capitalizeName(word);
    }
  }

  const joined = callerLines.join(" ");
  const patterns = [
    /(?:ich\s+)?bin\s+([a-zäöüß]+)\b/i,
    /(?:mein\s+)?name\s+ist\s+([a-zäöüß]+)\b/i,
    /ich\s+hei(?:ss|ß)e\s+([a-zäöüß]+)\b/i,
    /termin\s+für\s+([a-zäöüß]+)\b/i,
    /für\s+([a-zäöüß]+)\s+am\b/i,
    /nachname\s+([a-zäöüß]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = joined.match(pattern);
    if (match?.[1]) return capitalizeName(match[1]);
  }

  return undefined;
}

function extractAttendeeNameFromAgentRecap(
  transcript: TranscriptLine[]
): string | undefined {
  const agentText = transcript
    .filter((line) => line.speaker === "Agent")
    .map((line) => line.text)
    .join(" ");

  const patterns = [
    /(?:also|perfekt|gerne|okay|ok),?\s+([A-Za-zÄÖÜäöüß]{2,30}),?\s+am\s+\d/i,
    /termin\s+für\s+([A-Za-zÄÖÜäöüß]{2,30})\b/i,
    /(?:herr|frau)\s+([A-Za-zÄÖÜäöüß]{2,30})\b/i,
    /([A-Za-zÄÖÜäöüß]{2,30}),?\s+am\s+\d{1,2}\./i,
    /notiert[^.]*?\b([A-Za-zÄÖÜäöüß]{2,30})\b/i,
  ];

  for (const pattern of patterns) {
    const match = agentText.match(pattern);
    if (match?.[1]) return capitalizeName(match[1]);
  }

  return undefined;
}

function extractAttendeeName(
  transcript: TranscriptLine[],
  callerName?: string
): string | undefined {
  const fromCaller = extractAttendeeNameFromCallerLines(transcript, callerName);
  if (fromCaller) return fromCaller;

  const commaName = transcript
    .flatMap((line) => line.text.split(/[,;]/))
    .map((part) => part.trim())
    .find((part) => /^[A-Za-zÄÖÜäöüß]{2,30}$/.test(part));
  if (commaName) return capitalizeName(commaName);

  return extractAttendeeNameFromAgentRecap(transcript);
}

function addCalendarDays(reference: Date, days: number): Date {
  const next = new Date(reference);
  next.setDate(next.getDate() + days);
  return next;
}

function datePartsFromDate(date: Date): {
  year: number;
  monthIndex: number;
  day: number;
} {
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
  };
}

function extractRelativeDate(
  lower: string,
  reference: Date
): { year: number; monthIndex: number; day: number } | null {
  const refDay = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate()
  );

  if (/\bheute\b/.test(lower)) return datePartsFromDate(refDay);
  if (/\bübermorgen\b/.test(lower)) {
    return datePartsFromDate(addCalendarDays(refDay, 2));
  }
  if (/\bmorgen\b/.test(lower)) {
    return datePartsFromDate(addCalendarDays(refDay, 1));
  }

  const weekdayMatch = lower.match(
    /(?:nächsten?|kommenden?|am|diesen)\s*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\b/
  );
  if (weekdayMatch) {
    const target = WEEKDAY_INDEX[weekdayMatch[1]];
    if (target === undefined) return null;
    const current = refDay.getDay();
    let delta = target - current;
    if (delta <= 0) delta += 7;
    return datePartsFromDate(addCalendarDays(refDay, delta));
  }

  return null;
}

function extractIsoDate(
  lower: string
): { year: number; monthIndex: number; day: number } | null {
  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (!iso) return null;
  const year = Number(iso[1]);
  const monthIndex = Number(iso[2]) - 1;
  const day = Number(iso[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  return { year, monthIndex, day };
}

function extractDateParts(
  lower: string,
  reference: Date
): { year: number; monthIndex: number; day: number } | null {
  const iso = extractIsoDate(lower);
  if (iso) return iso;

  let year = reference.getFullYear();
  let monthIndex = -1;
  let day = -1;

  const numeric = lower.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (numeric) {
    day = Number(numeric[1]);
    monthIndex = Number(numeric[2]) - 1;
    if (numeric[3]) year = Number(numeric[3]);
  }

  const monthName =
    lower.match(
      /(?:am\s+)?(\d{1,2})\.?\s*(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/
    ) ??
    lower.match(
      /(?:am\s+)?(\d{1,2})\s+(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/
    );

  if (monthName) {
    day = Number(monthName[1]);
    monthIndex = MONTHS[normalizeMonthToken(monthName[2])];
    if (monthName[3]) year = Number(monthName[3]);
  }

  if (day >= 1 && day <= 31 && monthIndex >= 0 && monthIndex <= 11) {
    const candidate = new Date(year, monthIndex, day);
    const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    if (candidate < ref && !monthName?.[3] && !numeric?.[3]) {
      year += 1;
    }
    return { year, monthIndex, day };
  }

  return extractRelativeDate(lower, reference);
}

function extractTime(lower: string): { hour: number; minute: number } {
  const timeMatches = [
    ...Array.from(lower.matchAll(/(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*uhr/g)),
    ...Array.from(lower.matchAll(/\bum\s+(\d{1,2})(?::(\d{2}))?\b/g)),
  ];

  if (timeMatches.length > 0) {
    const last = timeMatches[timeMatches.length - 1];
    return {
      hour: Math.min(Math.max(Number(last[1]), 0), 23),
      minute: last[2] ? Math.min(Math.max(Number(last[2]), 0), 59) : 0,
    };
  }

  const bareTime = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (bareTime) {
    return {
      hour: Math.min(Math.max(Number(bareTime[1]), 0), 23),
      minute: Math.min(Math.max(Number(bareTime[2]), 0), 59),
    };
  }

  return { hour: 9, minute: 0 };
}

function extractAppointmentTypeId(lower: string): { id: string; label: string } {
  for (const entry of TYPE_SYNONYMS) {
    if (entry.patterns.some((pattern) => pattern.test(lower))) {
      return { id: entry.id, label: entry.label };
    }
  }
  return { id: "termin", label: "Termin" };
}

export interface ParsedCallAppointment {
  attendeeName: string;
  startIso: string;
  title: string;
  appointmentTypeId: string;
  timeZone: string;
}

function resolveAttendeeName(
  transcript: TranscriptLine[],
  callerName?: string
): string {
  const extracted = extractAttendeeName(transcript, callerName);
  if (extracted) return extracted;

  const trimmedCaller = callerName?.trim();
  if (trimmedCaller) return capitalizeName(trimmedCaller.split(/\s+/).pop() ?? trimmedCaller);

  return "Gast";
}

function parseFromTextSources(params: {
  sources: string[];
  transcript: TranscriptLine[];
  callerName?: string;
  referenceDate: Date;
}): ParsedCallAppointment | null {
  let dateParts: { year: number; monthIndex: number; day: number } | null = null;
  let hour = 9;
  let minute = 0;
  let typeSource = "";

  for (const source of params.sources) {
    const lower = source.toLowerCase();
    typeSource = typeSource || lower;
    dateParts = dateParts ?? extractDateParts(lower, params.referenceDate);
    const time = extractTime(lower);
    if (/\d{1,2}\s*(?::\d{2})?\s*uhr|\bum\s+\d{1,2}|\b\d{1,2}:\d{2}\b/.test(lower)) {
      hour = time.hour;
      minute = time.minute;
    }
  }

  if (!dateParts) return null;

  const attendeeName = resolveAttendeeName(params.transcript, params.callerName);
  const appointmentType = extractAppointmentTypeId(typeSource || params.sources.join(" ").toLowerCase());

  return {
    attendeeName,
    title: appointmentType.label,
    appointmentTypeId: appointmentType.id,
    timeZone: DEFAULT_TZ,
    startIso: buildZurichIso(
      dateParts.year,
      dateParts.monthIndex,
      dateParts.day,
      hour,
      minute
    ),
  };
}

export function parseAppointmentFromTranscript(params: {
  transcript: TranscriptLine[];
  callerName?: string;
  referenceDate?: Date;
}): ParsedCallAppointment | null {
  const referenceDate = params.referenceDate ?? new Date();
  const fullText = params.transcript.map((line) => line.text).join(" ");
  const agentRecap = extractAgentRecapText(params.transcript);
  const callerText = params.transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => line.text)
    .join(" ");

  const sources = [agentRecap, callerText, fullText].filter(
    (entry) => entry.trim().length > 0
  );

  return parseFromTextSources({
    sources,
    transcript: params.transcript,
    callerName: params.callerName,
    referenceDate,
  });
}
