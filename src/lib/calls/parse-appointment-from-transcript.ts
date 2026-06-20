import { DEFAULT_TZ } from "@/lib/calendar";
import type { TranscriptLine } from "@/lib/types";

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

function extractAttendeeName(
  text: string,
  callerName?: string
): string | undefined {
  const trimmedCaller = callerName?.trim();
  if (trimmedCaller) return trimmedCaller;

  const patterns = [
    /ich bin\s+((?:[A-ZÄÖÜ][a-zäöüß]+)(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i,
    /mein name ist\s+((?:[A-ZÄÖÜ][a-zäöüß]+)(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i,
    /ich hei(?:ss|ß)e\s+((?:[A-ZÄÖÜ][a-zäöüß]+)(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return undefined;
}

function extractDateParts(
  lower: string,
  reference: Date
): { year: number; monthIndex: number; day: number } | null {
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
      /(?:am\s+)?(\d{1,2})\.\s*(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/
    ) ??
    lower.match(
      /(?:am\s+)?(\d{1,2})\s+(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/
    );

  if (monthName) {
    day = Number(monthName[1]);
    monthIndex = MONTHS[normalizeMonthToken(monthName[2])];
    if (monthName[3]) year = Number(monthName[3]);
  }

  if (day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day };
}

function extractTime(lower: string): { hour: number; minute: number } {
  const match = lower.match(/(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*uhr/);
  if (!match) return { hour: 9, minute: 0 };
  return {
    hour: Math.min(Math.max(Number(match[1]), 0), 23),
    minute: match[2] ? Math.min(Math.max(Number(match[2]), 0), 59) : 0,
  };
}

function extractTitle(lower: string): string {
  if (lower.includes("sprechstunde")) return "Sprechstunde";
  if (lower.includes("besichtigung")) return "Besichtigung";
  if (lower.includes("rückruf") || lower.includes("rueckruf")) return "Rückruf";
  if (lower.includes("termin")) return "Termin";
  return "Sprechstunde";
}

export interface ParsedCallAppointment {
  attendeeName: string;
  startIso: string;
  title: string;
  timeZone: string;
}

export function parseAppointmentFromTranscript(params: {
  transcript: TranscriptLine[];
  callerName?: string;
  referenceDate?: Date;
}): ParsedCallAppointment | null {
  const text = params.transcript.map((line) => line.text).join(" ");
  const lower = text.toLowerCase();
  const attendeeName = extractAttendeeName(text, params.callerName);
  if (!attendeeName) return null;

  const dateParts = extractDateParts(lower, params.referenceDate ?? new Date());
  if (!dateParts) return null;

  const { hour, minute } = extractTime(lower);
  const title = extractTitle(lower);

  return {
    attendeeName,
    title,
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
