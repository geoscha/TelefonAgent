import { DEFAULT_TZ } from "@/lib/calendar/types";

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  maerz: 3,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

function zurichOffsetForMonth(month: number): string {
  return month >= 3 && month <= 10 ? "+02:00" : "+01:00";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeGermanMonth(token: string): string {
  return token
    .toLowerCase()
    .replace("ä", "ae")
    .replace("ö", "oe")
    .replace("ü", "ue")
    .trim();
}

function buildZurichIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  const offset = zurichOffsetForMonth(month);
  const local = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${offset}`;
  const parsed = new Date(local);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function inferYear(month: number, day: number, reference: Date): number {
  const refParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);

  const refYear = Number(refParts.find((p) => p.type === "year")?.value ?? "2026");
  const refMonth = Number(refParts.find((p) => p.type === "month")?.value ?? "1");
  const refDay = Number(refParts.find((p) => p.type === "day")?.value ?? "1");

  let year = refYear;
  if (month < refMonth || (month === refMonth && day < refDay)) {
    year += 1;
  }
  return year;
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/\s*uhr\s*$/, "")
    .replace(/['′]$/, "");

  const minuteOnly = /^(\d{1,3})\s*(?:min(?:uten)?)?$/.exec(trimmed);
  if (minuteOnly) return null;

  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function parseDurationMinutes(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim().toLowerCase().replace(/['′]/g, "");
  const match = /^(\d{1,3})\s*(?:min(?:uten)?)?$/.exec(trimmed);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return undefined;
  return minutes;
}

function parseDateToken(
  value: string,
  reference: Date
): { year: number; month: number; day: number } | null {
  const trimmed = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const numeric = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(trimmed);
  if (numeric) {
    const yearRaw = Number(numeric[3]);
    return {
      year: yearRaw < 100 ? 2000 + yearRaw : yearRaw,
      month: Number(numeric[2]),
      day: Number(numeric[1]),
    };
  }

  const named =
    /^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})?$/.exec(trimmed) ??
    /^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)$/.exec(trimmed) ??
    /^(\d{1,2})\s+([A-Za-zÄÖÜäöü]+)\s*(\d{4})?$/.exec(trimmed) ??
    /^(\d{1,2})\s+([A-Za-zÄÖÜäöü]+)$/.exec(trimmed);
  if (named) {
    const month = GERMAN_MONTHS[normalizeGermanMonth(named[2])];
    if (!month) return null;
    const day = Number(named[1]);
    const year = named[3]
      ? Number(named[3])
      : inferYear(month, day, reference);
    return { year, month, day };
  }

  return null;
}

function parseFlexibleStartIso(raw: string, reference: Date): string | null {
  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const withTz =
      trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)
        ? trimmed
        : `${trimmed}${zurichOffsetForMonth(Number(trimmed.slice(5, 7)))}`;
    const parsed = new Date(withTz);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const deDateTime =
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?)?$/i.exec(
      trimmed
    );
  if (deDateTime) {
    const iso = buildZurichIso(
      Number(deDateTime[3]),
      Number(deDateTime[2]),
      Number(deDateTime[1]),
      deDateTime[4] ? Number(deDateTime[4]) : 9,
      deDateTime[5] ? Number(deDateTime[5]) : 0
    );
    if (iso) return iso;
  }

  const deNamed =
    /(\d{1,2})\.?\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})?(?:\s+um\s+(\d{1,2})(?::(\d{2}))?\s*uhr)?/i.exec(
      trimmed
    );
  if (deNamed) {
    const month = GERMAN_MONTHS[normalizeGermanMonth(deNamed[2])];
    if (month) {
      const day = Number(deNamed[1]);
      const year = deNamed[3]
        ? Number(deNamed[3])
        : inferYear(month, day, reference);
      const iso = buildZurichIso(
        year,
        month,
        day,
        deNamed[4] ? Number(deNamed[4]) : 9,
        deNamed[5] ? Number(deNamed[5]) : 0
      );
      if (iso) return iso;
    }
  }

  const spaced = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}(?::\d{2})?)/.exec(trimmed);
  if (spaced) {
    const clock = parseClock(spaced[2]);
    const date = parseDateToken(spaced[1], reference);
    if (clock && date) {
      const iso = buildZurichIso(
        date.year,
        date.month,
        date.day,
        clock.hour,
        clock.minute
      );
      if (iso) return iso;
    }
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  return null;
}

export function resolveAppointmentStartIso(input: {
  startIso?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  referenceDate?: Date;
}): { iso: string } | { error: string } {
  const reference = input.referenceDate ?? new Date();

  if (input.appointmentDate?.trim() && input.appointmentTime?.trim()) {
    const date = parseDateToken(input.appointmentDate, reference);
    const clock = parseClock(input.appointmentTime);
    if (date && clock) {
      const iso = buildZurichIso(
        date.year,
        date.month,
        date.day,
        clock.hour,
        clock.minute
      );
      if (iso) return { iso };
    }
  }

  if (input.startIso?.trim()) {
    const iso = parseFlexibleStartIso(input.startIso, reference);
    if (iso) return { iso };
  }

  if (input.appointmentDate?.trim()) {
    const date = parseDateToken(input.appointmentDate, reference);
    if (date) {
      const iso = buildZurichIso(date.year, date.month, date.day, 9, 0);
      if (iso) return { iso };
    }
  }

  return {
    error:
      "Datum oder Uhrzeit konnte nicht gelesen werden. Nutze appointmentDate (YYYY-MM-DD) und appointmentTime (HH:mm).",
  };
}
