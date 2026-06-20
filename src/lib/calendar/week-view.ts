import { DEFAULT_TZ } from "@/lib/calendar/types";

const MS_DAY = 86_400_000;

export interface WeekDay {
  date: Date;
  dayIso: string;
  label: string;
  weekdayShort: string;
  isToday: boolean;
}

function zurichParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

export function toDayIso(date: Date, timeZone = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function zurichWeekdayIndex(date: Date): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TZ,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

export function startOfWeekMonday(date: Date): Date {
  const { year, month, day } = zurichParts(date);
  const local = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = zurichWeekdayIndex(local);
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return new Date(local.getTime() + diff * MS_DAY);
}

export function startOfToday(date = new Date()): Date {
  const { year, month, day } = zurichParts(date);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_DAY);
}

export function buildWeekDays(weekStart: Date): WeekDay[] {
  return buildDaysFrom(weekStart, 7);
}

export function buildDaysFrom(startDate: Date, count: number): WeekDay[] {
  const todayIso = toDayIso(new Date());
  const weekdayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  return Array.from({ length: count }, (_, index) => {
    const date = addDays(startDate, index);
    const dayIso = toDayIso(date);
    const { day } = zurichParts(date);
    return {
      date,
      dayIso,
      label: String(day),
      weekdayShort: weekdayLabels[zurichWeekdayIndex(date)],
      isToday: dayIso === todayIso,
    };
  });
}

export function addDaysToDayIso(dayIso: string, days: number): string {
  const [year, month, day] = dayIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return toDayIso(anchor);
}

export function weekRangeIso(weekStart: Date): { from: string; to: string } {
  const from = toDayIso(weekStart);
  const toExclusive = addDays(weekStart, 7);
  return { from, to: toDayIso(toExclusive) };
}

export function formatWeekTitle(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const fmt = (date: Date) =>
    new Intl.DateTimeFormat("de-CH", {
      timeZone: DEFAULT_TZ,
      day: "numeric",
      month: "long",
    }).format(date);
  const year = zurichParts(end).year;
  return `${fmt(weekStart)} – ${fmt(end)} ${year}`;
}

export function minutesInTimeZone(iso: string, timeZone = DEFAULT_TZ): number {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0"
  );
  return hour * 60 + minute;
}

export function eventDayIso(iso: string, timeZone = DEFAULT_TZ): string {
  return toDayIso(new Date(iso), timeZone);
}

export function defaultEventEndIso(startIso: string, durationMinutes = 30): string {
  return new Date(
    new Date(startIso).getTime() + durationMinutes * 60_000
  ).toISOString();
}

export const CALENDAR_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Core business-day band shown prominently (06:00–19:59). */
export const CALENDAR_FOCUS_START_HOUR = 6;
export const CALENDAR_FOCUS_END_HOUR = 19;

export const FOCUS_HOUR_HEIGHT_PX = 28;
export const EDGE_HOUR_HEIGHT_PX = 5;

/** Taller fixed rows for the scrollable calendar (6–19 h prominent, edges still visible). */
export const SCROLL_FOCUS_HOUR_HEIGHT_PX = 48;
export const SCROLL_EDGE_HOUR_HEIGHT_PX = 28;

/** @deprecated Use hourHeightPx() — kept for any legacy imports. */
export const HOUR_HEIGHT_PX = FOCUS_HOUR_HEIGHT_PX;

export function hourHeightPx(hour: number): number {
  return hour >= CALENDAR_FOCUS_START_HOUR && hour <= CALENDAR_FOCUS_END_HOUR
    ? FOCUS_HOUR_HEIGHT_PX
    : EDGE_HOUR_HEIGHT_PX;
}

function scrollHourHeightPx(hour: number): number {
  return hour >= CALENDAR_FOCUS_START_HOUR && hour <= CALENDAR_FOCUS_END_HOUR
    ? SCROLL_FOCUS_HOUR_HEIGHT_PX
    : SCROLL_EDGE_HOUR_HEIGHT_PX;
}

function scrollHourTopPx(hour: number): number {
  let top = 0;
  for (let h = 0; h < hour; h++) top += scrollHourHeightPx(h);
  return top;
}

export function scrollableCalendarGridHeightPx(): number {
  return CALENDAR_HOURS.reduce((sum, hour) => sum + scrollHourHeightPx(hour), 0);
}

export function hourTopPx(hour: number): number {
  let top = 0;
  for (let h = 0; h < hour; h++) top += hourHeightPx(h);
  return top;
}

export function minutesToGridPx(minutes: number): number {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60));
  const hour = Math.min(23, Math.floor(clamped / 60));
  const minute = clamped % 60;
  return hourTopPx(hour) + (minute / 60) * hourHeightPx(hour);
}

export function durationToGridPx(startMinutes: number, endMinutes: number): number {
  return Math.max(minutesToGridPx(endMinutes) - minutesToGridPx(startMinutes), 22);
}

export function calendarGridHeightPx(): number {
  return CALENDAR_HOURS.reduce((sum, hour) => sum + hourHeightPx(hour), 0);
}

export interface CalendarLayout {
  gridHeight: number;
  scale: number;
  hourHeight: (hour: number) => number;
  hourTop: (hour: number) => number;
  minutesToGridPx: (minutes: number) => number;
  durationToGridPx: (startMinutes: number, endMinutes: number) => number;
  focusBandTop: number;
  focusBandHeight: number;
}

/** Scales the 06:00–19:00 focus band to fill the available viewport height. */
export function buildCalendarLayout(gridHeight: number): CalendarLayout {
  const baseHeight = calendarGridHeightPx();
  const scale = gridHeight / baseHeight;

  const hourHeight = (hour: number) => hourHeightPx(hour) * scale;
  const hourTop = (hour: number) => {
    let top = 0;
    for (let h = 0; h < hour; h++) top += hourHeight(h);
    return top;
  };
  const minutesToGridPxScaled = (minutes: number) => {
    const clamped = Math.max(0, Math.min(minutes, 24 * 60));
    const hour = Math.min(23, Math.floor(clamped / 60));
    const minute = clamped % 60;
    return hourTop(hour) + (minute / 60) * hourHeight(hour);
  };
  const durationToGridPxScaled = (startMinutes: number, endMinutes: number) =>
    Math.max(
      minutesToGridPxScaled(endMinutes) - minutesToGridPxScaled(startMinutes),
      22 * scale
    );

  const focusBandTop = hourTop(CALENDAR_FOCUS_START_HOUR);
  const focusBandHeight =
    hourTop(CALENDAR_FOCUS_END_HOUR + 1) - focusBandTop;

  return {
    gridHeight,
    scale,
    hourHeight,
    hourTop,
    minutesToGridPx: minutesToGridPxScaled,
    durationToGridPx: durationToGridPxScaled,
    focusBandTop,
    focusBandHeight,
  };
}

/** Fixed-height layout for vertical scrolling (does not scale to viewport). */
export function buildScrollableCalendarLayout(): CalendarLayout {
  const gridHeight = scrollableCalendarGridHeightPx();

  const hourHeight = (hour: number) => scrollHourHeightPx(hour);
  const hourTop = (hour: number) => scrollHourTopPx(hour);
  const minutesToGridPxScaled = (minutes: number) => {
    const clamped = Math.max(0, Math.min(minutes, 24 * 60));
    const hour = Math.min(23, Math.floor(clamped / 60));
    const minute = clamped % 60;
    return hourTop(hour) + (minute / 60) * hourHeight(hour);
  };
  const durationToGridPxScaled = (startMinutes: number, endMinutes: number) =>
    Math.max(
      minutesToGridPxScaled(endMinutes) - minutesToGridPxScaled(startMinutes),
      22
    );

  const focusBandTop = hourTop(CALENDAR_FOCUS_START_HOUR);
  const focusBandHeight =
    hourTop(CALENDAR_FOCUS_END_HOUR + 1) - focusBandTop;

  return {
    gridHeight,
    scale: 1,
    hourHeight,
    hourTop,
    minutesToGridPx: minutesToGridPxScaled,
    durationToGridPx: durationToGridPxScaled,
    focusBandTop,
    focusBandHeight,
  };
}

export function gridPxToMinutes(px: number, layout: CalendarLayout): number {
  const clampedPx = Math.max(0, Math.min(px, layout.gridHeight));

  for (let hour = 0; hour < 24; hour++) {
    const hourTop = layout.hourTop(hour);
    const hourHeight = layout.hourHeight(hour);
    const hourBottom = hourTop + hourHeight;
    if (clampedPx < hourBottom || hour === 23) {
      const minute =
        hourHeight > 0 ? ((clampedPx - hourTop) / hourHeight) * 60 : 0;
      return Math.max(0, Math.min(24 * 60 - 1, hour * 60 + minute));
    }
  }

  return 24 * 60 - 1;
}

/** Scroll offset that centers the 06:00–20:00 band in the viewport. */
export function focusBlockScrollOffset(
  viewportHeight: number,
  layout?: CalendarLayout
): number {
  const hourTop = layout?.hourTop ?? hourTopPx;
  const focusTop = hourTop(CALENDAR_FOCUS_START_HOUR);
  const focusBottom = hourTop(CALENDAR_FOCUS_END_HOUR + 1);
  const focusHeight = focusBottom - focusTop;
  const padding = Math.max(0, (viewportHeight - focusHeight) / 2);
  return Math.max(0, focusTop - padding);
}

/** @deprecated Use calendarGridHeightPx(). */
export const CALENDAR_GRID_HEIGHT_PX = calendarGridHeightPx();
