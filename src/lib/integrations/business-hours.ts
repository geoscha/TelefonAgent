import { DEFAULT_TZ } from "@/lib/calendar/types";

export interface TimeRange {
  /** 24h "HH:mm" */
  start: string;
  end: string;
}

export interface DayBusinessHours {
  closed: boolean;
  ranges: TimeRange[];
}

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface BusinessHoursSchedule {
  timeZone: string;
  monday: DayBusinessHours;
  tuesday: DayBusinessHours;
  wednesday: DayBusinessHours;
  thursday: DayBusinessHours;
  friday: DayBusinessHours;
  saturday: DayBusinessHours;
  sunday: DayBusinessHours;
  /** Human-readable summary for prompts and UI. */
  summary: {
    weekdays: string;
    saturday: string;
    sunday: string;
  };
}

const WEEKDAY_KEYS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKDAY_INDEX: Record<WeekdayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function weekdayKeyFromDate(date: Date, timeZone: string): WeekdayKey {
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  })
    .format(date)
    .toLowerCase();
  return label as WeekdayKey;
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function closedDay(): DayBusinessHours {
  return { closed: true, ranges: [] };
}

function lunchSplit(
  morningEnd: string,
  afternoonStart: string,
  afternoonEnd: string
): DayBusinessHours {
  return {
    closed: false,
    ranges: [
      { start: "08:00", end: morningEnd },
      { start: afternoonStart, end: afternoonEnd },
    ],
  };
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursSchedule = {
  timeZone: DEFAULT_TZ,
  monday: lunchSplit("12:00", "13:00", "17:00"),
  tuesday: lunchSplit("12:00", "13:00", "17:00"),
  wednesday: lunchSplit("12:00", "13:00", "17:00"),
  thursday: lunchSplit("12:00", "13:00", "17:00"),
  friday: lunchSplit("12:00", "13:00", "17:00"),
  saturday: closedDay(),
  sunday: closedDay(),
  summary: {
    weekdays: "Mo–Fr 08:00–12:00, 13:00–17:00",
    saturday: "Geschlossen",
    sunday: "Geschlossen",
  },
};

function normalizeDay(value: unknown, fallback: DayBusinessHours): DayBusinessHours {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  if (raw.closed === true) return closedDay();

  const ranges = Array.isArray(raw.ranges)
    ? raw.ranges
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const range = entry as Record<string, unknown>;
          const start =
            typeof range.start === "string" ? range.start.trim() : "";
          const end = typeof range.end === "string" ? range.end.trim() : "";
          if (!start || !end || parseClock(start) === null || parseClock(end) === null) {
            return null;
          }
          if ((parseClock(start) ?? 0) >= (parseClock(end) ?? 0)) return null;
          return { start, end };
        })
        .filter((entry): entry is TimeRange => entry !== null)
    : [];

  if (ranges.length === 0) return fallback;
  return { closed: false, ranges };
}

function buildSummary(schedule: Omit<BusinessHoursSchedule, "summary">): BusinessHoursSchedule["summary"] {
  const formatDay = (day: DayBusinessHours): string => {
    if (day.closed || day.ranges.length === 0) return "Geschlossen";
    return day.ranges.map((range) => `${range.start}–${range.end}`).join(", ");
  };

  const weekdaySample = formatDay(schedule.monday);
  const sameWeekdays = ["tuesday", "wednesday", "thursday", "friday"].every(
    (key) => formatDay(schedule[key as WeekdayKey]) === weekdaySample
  );

  return {
    weekdays: sameWeekdays ? `Mo–Fr ${weekdaySample}` : `Mo ${formatDay(schedule.monday)} (siehe Einstellungen)`,
    saturday: formatDay(schedule.saturday),
    sunday: formatDay(schedule.sunday),
  };
}

export function normalizeBusinessHours(value: unknown): BusinessHoursSchedule {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BUSINESS_HOURS };
  }

  const raw = value as Record<string, unknown>;
  const base = {
    timeZone:
      typeof raw.timeZone === "string" && raw.timeZone.trim()
        ? raw.timeZone.trim()
        : DEFAULT_TZ,
    monday: normalizeDay(raw.monday, DEFAULT_BUSINESS_HOURS.monday),
    tuesday: normalizeDay(raw.tuesday, DEFAULT_BUSINESS_HOURS.tuesday),
    wednesday: normalizeDay(raw.wednesday, DEFAULT_BUSINESS_HOURS.wednesday),
    thursday: normalizeDay(raw.thursday, DEFAULT_BUSINESS_HOURS.thursday),
    friday: normalizeDay(raw.friday, DEFAULT_BUSINESS_HOURS.friday),
    saturday: normalizeDay(raw.saturday, DEFAULT_BUSINESS_HOURS.saturday),
    sunday: normalizeDay(raw.sunday, DEFAULT_BUSINESS_HOURS.sunday),
  };

  const summary =
    raw.summary && typeof raw.summary === "object"
      ? {
          weekdays:
            typeof (raw.summary as Record<string, unknown>).weekdays === "string"
              ? String((raw.summary as Record<string, unknown>).weekdays).trim()
              : buildSummary(base).weekdays,
          saturday:
            typeof (raw.summary as Record<string, unknown>).saturday === "string"
              ? String((raw.summary as Record<string, unknown>).saturday).trim()
              : buildSummary(base).saturday,
          sunday:
            typeof (raw.summary as Record<string, unknown>).sunday === "string"
              ? String((raw.summary as Record<string, unknown>).sunday).trim()
              : buildSummary(base).sunday,
        }
      : buildSummary(base);

  return { ...base, summary };
}

function localParts(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function isWithinBusinessHours(
  start: Date,
  end: Date,
  scheduleInput?: BusinessHoursSchedule | null
): boolean {
  const schedule = normalizeBusinessHours(scheduleInput);
  const timeZone = schedule.timeZone;
  const dayKey = weekdayKeyFromDate(start, timeZone);
  const day = schedule[dayKey];
  if (day.closed || day.ranges.length === 0) return false;

  const startMinutes =
    localParts(start, timeZone).hour * 60 + localParts(start, timeZone).minute;
  const endMinutes =
    localParts(end, timeZone).hour * 60 + localParts(end, timeZone).minute;
  if (endMinutes <= startMinutes) return false;

  return day.ranges.some((range) => {
    const open = parseClock(range.start);
    const close = parseClock(range.end);
    if (open === null || close === null) return false;
    return startMinutes >= open && endMinutes <= close;
  });
}

export function formatBusinessHoursForPrompt(
  scheduleInput?: BusinessHoursSchedule | null
): string {
  const schedule = normalizeBusinessHours(scheduleInput);
  return [
    `- Werktage: ${schedule.summary.weekdays}`,
    `- Samstag: ${schedule.summary.saturday}`,
    `- Sonntag: ${schedule.summary.sunday}`,
    "- Buche Termine nur innerhalb dieser Zeiten.",
    "- Prüfe bei Buchungswunsch die Verfügbarkeit; schlage bei Konflikten alternative Zeiten vor.",
  ].join("\n");
}

function parseTimeToken(token: string): string | null {
  const cleaned = token
    .trim()
    .toLowerCase()
    .replace(/\s*uhr$/, "")
    .replace(/\./g, ":");
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(cleaned);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return formatClock(hour * 60 + minute);
}

function parseRangeText(text: string): TimeRange[] {
  const ranges: TimeRange[] = [];
  const chunks = text.split(/[,;]|\s+und\s+/i);
  for (const chunk of chunks) {
    const match = chunk.match(
      /(\d{1,2}(?::\d{2})?)\s*(?:-|–|bis)\s*(\d{1,2}(?::\d{2})?)/
    );
    if (!match) continue;
    const start = parseTimeToken(match[1]);
    const end = parseTimeToken(match[2]);
    if (!start || !end || (parseClock(start) ?? 0) >= (parseClock(end) ?? 0)) {
      continue;
    }
    ranges.push({ start, end });
  }
  return ranges;
}

function applyWeekdayRange(
  schedule: BusinessHoursSchedule,
  rangeText: string
): BusinessHoursSchedule {
  if (/geschlossen|closed/i.test(rangeText)) {
    return schedule;
  }
  const ranges = parseRangeText(rangeText);
  if (ranges.length === 0) return schedule;

  const day: DayBusinessHours = { closed: false, ranges };
  return {
    ...schedule,
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
  };
}

/** Best-effort extraction from website text or imprint blocks. */
export function extractBusinessHoursFromText(text: string): BusinessHoursSchedule | null {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return null;

  const openingBlock =
    source.match(
      /(?:öffnungszeiten|oeffnungszeiten|sprechzeiten|office hours|horaires)[:\s-]*(.{0,220})/i
    )?.[1] ?? source.slice(0, 1200);

  let schedule = { ...DEFAULT_BUSINESS_HOURS };

  const weekdayMatch = openingBlock.match(
    /(?:mo(?:ntag)?(?:\s*[-–]\s*fr(?:eitag)?)?|werktage|di(?:enstag)?(?:\s*[-–]\s*fr(?:eitag)?)?)[^0-9]{0,20}([\d:.–\s,-]+(?:uhr)?)/i
  );
  if (weekdayMatch?.[1]) {
    schedule = applyWeekdayRange(schedule, weekdayMatch[1]);
  } else {
    const generic = openingBlock.match(
      /(\d{1,2}(?::\d{2})?\s*(?:-|–|bis)\s*\d{1,2}(?::\d{2})?)/i
    );
    if (generic?.[1]) {
      schedule = applyWeekdayRange(schedule, generic[1]);
    }
  }

  const saturdayMatch = openingBlock.match(
    /sa(?:mstag)?[^0-9]{0,20}([\d:.–\s,-]+|geschlossen)/i
  );
  if (saturdayMatch?.[1]) {
    if (/geschlossen|closed/i.test(saturdayMatch[1])) {
      schedule.saturday = closedDay();
    } else {
      const ranges = parseRangeText(saturdayMatch[1]);
      if (ranges.length > 0) schedule.saturday = { closed: false, ranges };
    }
  }

  const sundayMatch = openingBlock.match(
    /so(?:nntag)?[^0-9]{0,20}([\d:.–\s,-]+|geschlossen)/i
  );
  if (sundayMatch?.[1]) {
    if (/geschlossen|closed/i.test(sundayMatch[1])) {
      schedule.sunday = closedDay();
    } else {
      const ranges = parseRangeText(sundayMatch[1]);
      if (ranges.length > 0) schedule.sunday = { closed: false, ranges };
    }
  }

  const changed =
    JSON.stringify(schedule.monday) !== JSON.stringify(DEFAULT_BUSINESS_HOURS.monday) ||
    JSON.stringify(schedule.saturday) !== JSON.stringify(DEFAULT_BUSINESS_HOURS.saturday) ||
    JSON.stringify(schedule.sunday) !== JSON.stringify(DEFAULT_BUSINESS_HOURS.sunday);

  if (!changed) return null;

  const summary = buildSummary(schedule);
  return { ...schedule, summary };
}

export function businessHoursFromSummaryStrings(input: {
  weekdays?: string;
  saturday?: string;
  sunday?: string;
}): BusinessHoursSchedule {
  let schedule = { ...DEFAULT_BUSINESS_HOURS };
  const weekdayText = input.weekdays?.trim() ?? "";
  const weekdayRanges = weekdayText.replace(/^mo[–-]fr\s*/i, "").trim();

  if (weekdayText) {
    if (/geschlossen|closed/i.test(weekdayText)) {
      schedule.monday = closedDay();
      schedule.tuesday = closedDay();
      schedule.wednesday = closedDay();
      schedule.thursday = closedDay();
      schedule.friday = closedDay();
    } else {
      schedule = applyWeekdayRange(schedule, weekdayRanges || weekdayText);
    }
  }
  if (input.saturday?.trim()) {
    schedule.saturday = /geschlossen|closed/i.test(input.saturday)
      ? closedDay()
      : { closed: false, ranges: parseRangeText(input.saturday) };
  }
  if (input.sunday?.trim()) {
    schedule.sunday = /geschlossen|closed/i.test(input.sunday)
      ? closedDay()
      : { closed: false, ranges: parseRangeText(input.sunday) };
  }

  return {
    ...schedule,
    summary: {
      weekdays: input.weekdays?.trim() || buildSummary(schedule).weekdays,
      saturday: input.saturday?.trim() || buildSummary(schedule).saturday,
      sunday: input.sunday?.trim() || buildSummary(schedule).sunday,
    },
  };
}

export function weekdayKeys(): WeekdayKey[] {
  return [...WEEKDAY_KEYS];
}

export function weekdayLabel(key: WeekdayKey): string {
  const labels: Record<WeekdayKey, string> = {
    monday: "Montag",
    tuesday: "Dienstag",
    wednesday: "Mittwoch",
    thursday: "Donnerstag",
    friday: "Freitag",
    saturday: "Samstag",
    sunday: "Sonntag",
  };
  return labels[key];
}

export function weekdayIndex(key: WeekdayKey): number {
  return WEEKDAY_INDEX[key];
}
