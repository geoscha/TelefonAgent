"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addDays,
  addDaysToDayIso,
  buildDaysFrom,
  buildScrollableCalendarLayout,
  CALENDAR_FOCUS_END_HOUR,
  CALENDAR_FOCUS_START_HOUR,
  CALENDAR_HOURS,
  focusBlockScrollOffset,
  formatWeekTitle,
  gridPxToMinutes,
  minutesInTimeZone,
  eventDayIso,
  startOfToday,
  toDayIso,
  type CalendarLayout,
  type WeekDay,
} from "@/lib/calendar/week-view";
import { userLabelClass, userPanelClass } from "@/components/user/user-styles";
import { PROVIDER_META, type CalendarProviderId } from "@/lib/calendar/provider-meta";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  dayIso: string;
  eventUrl?: string;
  cancelled?: boolean;
  linkerManaged: boolean;
}

interface EventsResponse {
  ok?: boolean;
  connected?: boolean;
  provider?: CalendarProviderId;
  accountLabel?: string;
  events?: CalendarEvent[];
  error?: string;
}

const SCROLL_LAYOUT = buildScrollableCalendarLayout();
const DRAG_THRESHOLD_PX = 6;
const SNAP_MINUTES = 15;
const STRIP_DAYS = 42;
const VISIBLE_DAYS = 7;
const MS_DAY = 86_400_000;

/** Height of the sticky day header inside the scroll strip. */
const HEADER_ROW_HEIGHT_PX = 58;

type EventDragState = {
  event: CalendarEvent;
  pointerId: number;
  durationMinutes: number;
  grabOffsetPx: number;
  dayIndex: number;
  startMinutes: number;
};

function pointerToGridCoords(
  clientX: number,
  clientY: number,
  scrollEl: HTMLDivElement,
  stripDaysCount: number
): { dayIndex: number; gridYPx: number } | null {
  const rect = scrollEl.getBoundingClientRect();
  const xInContent = clientX - rect.left + scrollEl.scrollLeft;
  const yInContent = clientY - rect.top + scrollEl.scrollTop;
  const gridYPx = yInContent - HEADER_ROW_HEIGHT_PX;
  const dayWidth = scrollEl.scrollWidth / stripDaysCount;
  if (dayWidth <= 0) return null;
  const dayIndex = Math.max(
    0,
    Math.min(stripDaysCount - 1, Math.floor(xInContent / dayWidth))
  );
  return { dayIndex, gridYPx };
}

function computeFetchRange(centerDate: Date) {
  const anchor = addDays(centerDate, -Math.floor(STRIP_DAYS / 2));
  return {
    from: addDaysToDayIso(toDayIso(anchor), -1),
    to: addDaysToDayIso(toDayIso(anchor), STRIP_DAYS + 1),
  };
}

function useDebouncedCallback(callback: (date: Date) => void, delayMs: number) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);
  callbackRef.current = callback;

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return useCallback((date: Date) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      callbackRef.current(date);
    }, delayMs);
  }, [delayMs]);
}

function dayIndexFromAnchor(anchor: Date, day: Date): number {
  return Math.round((day.getTime() - anchor.getTime()) / MS_DAY);
}

function eventOccursOnDay(event: CalendarEvent, dayIso: string): boolean {
  if (event.dayIso === dayIso) return true;
  const start = new Date(event.startIso).getTime();
  const end = new Date(event.endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;

  const month = Number(dayIso.slice(5, 7));
  const offset = month >= 3 && month <= 10 ? "+02:00" : "+01:00";
  const dayStart = new Date(`${dayIso}T00:00:00${offset}`).getTime();
  const dayEnd = new Date(`${dayIso}T23:59:59${offset}`).getTime();
  return start <= dayEnd && end >= dayStart;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Zurich",
  });
}

function zurichUtcOffset(month: number): string {
  return month >= 3 && month <= 10 ? "+02:00" : "+01:00";
}

function formatMinutesLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesOnDayToIso(dayIso: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const month = Number(dayIso.slice(5, 7));
  const offset = zurichUtcOffset(month);
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return new Date(
    `${dayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`
  ).toISOString();
}

function isoToDatetimeLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function datetimeLocalToIso(value: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) throw new Error("Ungültige Zeitangabe.");
  const month = Number(datePart.slice(5, 7));
  const offset = zurichUtcOffset(month);
  return new Date(`${datePart}T${timePart}:00${offset}`).toISOString();
}

function defaultStartLocal(): string {
  const now = new Date();
  const zurichNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Zurich" })
  );
  const minutes = zurichNow.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  zurichNow.setMinutes(rounded, 0, 0);
  const y = zurichNow.getFullYear();
  const m = String(zurichNow.getMonth() + 1).padStart(2, "0");
  const d = String(zurichNow.getDate()).padStart(2, "0");
  const h = String(zurichNow.getHours()).padStart(2, "0");
  const min = String(zurichNow.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function defaultEndLocal(startLocal: string): string {
  const startIso = datetimeLocalToIso(startLocal);
  const endIso = new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString();
  return isoToDatetimeLocal(endIso);
}

async function createCalendarEventRequest(input: {
  title: string;
  startIso: string;
  endIso: string;
}): Promise<void> {
  const res = await fetch("/api/calendar/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Termin konnte nicht erstellt werden.");
  }
}

async function patchCalendarEvent(
  event: CalendarEvent,
  startIso: string,
  endIso: string,
  title?: string
): Promise<void> {
  const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventUrl: event.eventUrl,
      startIso,
      endIso,
      ...(title !== undefined ? { title } : {}),
    }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Termin konnte nicht gespeichert werden.");
  }
}

async function deleteCalendarEventRequest(event: CalendarEvent): Promise<void> {
  const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventUrl: event.eventUrl }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Termin konnte nicht gelöscht werden.");
  }
}

export function CalendarPageClient() {
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef(false);
  const deepLinkDayHandledRef = useRef(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accountLabel, setAccountLabel] = useState<string>();
  const [calendarProvider, setCalendarProvider] =
    useState<CalendarProviderId | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewStart, setViewStart] = useState(() => startOfToday());
  const [navTarget, setNavTarget] = useState(() => startOfToday());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [navToken, setNavToken] = useState(0);
  const [fetchRange, setFetchRange] = useState(() => computeFetchRange(startOfToday()));

  const handleVisibleStartChange = useDebouncedCallback((date: Date) => {
    setViewStart(date);
  }, 300);

  const navigateTo = useCallback((date: Date) => {
    setViewStart(date);
    setNavTarget(date);
    setNavToken((token) => token + 1);
    setFetchRange(computeFetchRange(date));
  }, []);

  const deepLinkEventId = searchParams.get("event")?.trim() ?? "";
  const deepLinkDay = searchParams.get("day")?.trim() ?? "";

  useEffect(() => {
    if (!deepLinkDay || !/^\d{4}-\d{2}-\d{2}$/.test(deepLinkDay)) return;
    if (deepLinkDayHandledRef.current) return;
    deepLinkDayHandledRef.current = true;
    navigateTo(new Date(`${deepLinkDay}T12:00:00`));
  }, [deepLinkDay, navigateTo]);

  useEffect(() => {
    if (!deepLinkEventId || deepLinkHandledRef.current || events.length === 0) {
      return;
    }

    const match = events.find((event) => event.id === deepLinkEventId);
    if (match) {
      deepLinkHandledRef.current = true;
      setSelectedEvent(match);
    }
  }, [deepLinkEventId, events]);

  const loadEvents = useCallback(
    async (options?: { silent?: boolean; screenCalls?: boolean; replace?: boolean }) => {
      const silent = options?.silent ?? false;
      const screenCalls = options?.screenCalls ?? false;
      const replace = options?.replace ?? false;
      if (!silent && connected === null) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const screenQuery = screenCalls ? "&screenCalls=1" : "";
        const res = await fetch(
          `/api/calendar/events?from=${fetchRange.from}&to=${fetchRange.to}${screenQuery}`
        );
        const data = (await res.json()) as EventsResponse;

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Kalender konnte nicht geladen werden.");
        }

        setConnected(Boolean(data.connected));
        setAccountLabel(data.accountLabel);
        setCalendarProvider(data.provider ?? null);
        setEvents((prev) => {
          const incoming = data.events ?? [];
          if (replace) return incoming;
          if (silent) {
            const merged = new Map(prev.map((event) => [event.id, event]));
            for (const event of incoming) {
              merged.set(event.id, event);
            }
            return Array.from(merged.values());
          }
          return incoming;
        });
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Kalender konnte nicht geladen werden."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [connected, fetchRange.from, fetchRange.to]
  );

  const handleReschedule = useCallback(
    async (
      event: CalendarEvent,
      startIso: string,
      endIso: string,
      title?: string
    ) => {
      setMutating(true);
      setActionError(null);
      const nextTitle = title?.trim() ? title.trim() : event.title;
      const optimistic: CalendarEvent = {
        ...event,
        title: nextTitle,
        startIso,
        endIso,
        dayIso: eventDayIso(startIso),
      };
      setEvents((prev) =>
        prev.map((item) => (item.id === event.id ? optimistic : item))
      );
      try {
        await patchCalendarEvent(
          event,
          startIso,
          endIso,
          nextTitle === event.title ? undefined : nextTitle
        );
        setSelectedEvent(null);
        await loadEvents({ silent: true });
      } catch (err) {
        setEvents((prev) =>
          prev.map((item) => (item.id === event.id ? event : item))
        );
        setActionError(
          err instanceof Error ? err.message : "Termin konnte nicht gespeichert werden."
        );
      } finally {
        setMutating(false);
      }
    },
    [loadEvents]
  );

  const handleCreate = useCallback(
    async (input: { title: string; startIso: string; endIso: string }) => {
      setMutating(true);
      setActionError(null);
      try {
        await createCalendarEventRequest(input);
        setCreateOpen(false);
        await loadEvents({ silent: true });
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Termin konnte nicht erstellt werden."
        );
      } finally {
        setMutating(false);
      }
    },
    [loadEvents]
  );

  const handleDelete = useCallback(
    async (event: CalendarEvent) => {
      setMutating(true);
      setActionError(null);
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
      setSelectedEvent(null);
      try {
        await deleteCalendarEventRequest(event);
        await loadEvents({ silent: true, replace: true });
      } catch (err) {
        setEvents((prev) => {
          if (prev.some((item) => item.id === event.id)) return prev;
          return [...prev, event].sort(
            (a, b) =>
              new Date(a.startIso).getTime() - new Date(b.startIso).getTime()
          );
        });
        setActionError(
          err instanceof Error ? err.message : "Termin konnte nicht gelöscht werden."
        );
      } finally {
        setMutating(false);
      }
    },
    [loadEvents]
  );

  const rangeInitialized = useRef(false);

  useEffect(() => {
    void loadEvents({
      silent: rangeInitialized.current,
      screenCalls: !rangeInitialized.current,
    });
    rangeInitialized.current = true;
  }, [fetchRange.from, fetchRange.to, loadEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadEvents({ silent: true, screenCalls: true });
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [loadEvents]);

  if (loading && connected === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[#525866]">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Laden" />
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <header className="space-y-1">
          <h1 className="text-[22px] font-normal text-[#0E121B]">Kalender</h1>
          <p className={userLabelClass}>
            Verbinden Sie zuerst einen Kalender, um Ihre Termine hier zu sehen.
          </p>
        </header>
        <div className={cn(userPanelClass, "p-6 text-center")}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#E1E4EA] bg-[#F5F7FA] text-[#525866]">
            <Plug className="h-5 w-5 stroke-[1.5]" />
          </div>
          <p className="text-[15px] text-[#0E121B]">Kein Kalender verbunden</p>
          <p className={`${userLabelClass} mt-2`}>
            Unter Integrationen können Sie Google, Outlook oder Apple Kalender verbinden.
          </p>
          <Link
            href="/integrationen"
            className={cn(landingBtnPrimary, "mt-5 inline-flex px-4 py-2 text-[13px]")}
          >
            Zu den Integrationen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-normal text-[#0E121B]">Kalender</h1>
          <p className={userLabelClass}>
            {calendarProvider && accountLabel
              ? `${PROVIDER_META[calendarProvider].name} · ${accountLabel}`
              : calendarProvider
                ? PROVIDER_META[calendarProvider].name
                : "Verbundener Kalender"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded border border-[#E1E4EA] bg-white px-3 text-[13px] text-[#525866] hover:bg-[#F5F7FA]"
            onClick={() => navigateTo(addDays(viewStart, -7))}
            aria-label="Vorherige Woche"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded border border-[#E1E4EA] bg-white px-3 text-[13px] text-[#525866] hover:bg-[#F5F7FA]"
            onClick={() => navigateTo(startOfToday())}
          >
            Heute
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded border border-[#E1E4EA] bg-white px-3 text-[13px] text-[#525866] hover:bg-[#F5F7FA]"
            onClick={() => navigateTo(addDays(viewStart, 7))}
            aria-label="Nächste Woche"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-[#E1E4EA] bg-white text-[#525866] hover:bg-[#F5F7FA]"
            onClick={() => void loadEvents({ silent: true, screenCalls: true })}
            disabled={refreshing}
            aria-label="Aktualisieren"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded bg-[#1e40af] text-white hover:bg-[#1e3a8a]"
            onClick={() => setCreateOpen(true)}
            aria-label="Neuer Termin"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      <p className="text-[12px] font-medium text-[#0E121B]">
        {formatWeekTitle(viewStart)}
      </p>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className={cn(userPanelClass, "relative flex min-h-0 flex-1 flex-col overflow-hidden")}>
        {refreshing ? (
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-[#E1E4EA] bg-white/95 px-2.5 py-1 text-[11px] text-[#525866] shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Laden…
          </div>
        ) : null}
        <CalendarWeekGrid
          navTarget={navTarget}
          navToken={navToken}
          events={events}
          refreshing={refreshing}
          showInitialPlaceholder={loading && events.length === 0}
          onSelectEvent={setSelectedEvent}
          onReschedule={handleReschedule}
          onVisibleStartChange={handleVisibleStartChange}
        />
      </div>

      <CreateEventDialog
        open={createOpen}
        mutating={mutating}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <EventDetailDialog
        event={selectedEvent}
        mutating={mutating}
        onClose={() => setSelectedEvent(null)}
        onReschedule={handleReschedule}
        onDelete={handleDelete}
      />
    </div>
  );
}

function CalendarWeekGrid({
  navTarget,
  navToken,
  events,
  refreshing,
  showInitialPlaceholder,
  onSelectEvent,
  onReschedule,
  onVisibleStartChange,
}: {
  navTarget: Date;
  navToken: number;
  events: CalendarEvent[];
  refreshing: boolean;
  showInitialPlaceholder: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onReschedule: (
    event: CalendarEvent,
    startIso: string,
    endIso: string,
    title?: string
  ) => Promise<void>;
  onVisibleStartChange: (date: Date) => void;
}) {
  const layout = SCROLL_LAYOUT;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripAnchorRef = useRef(addDays(navTarget, -Math.floor(STRIP_DAYS / 2)));
  const lastScrollLeftRef = useRef(0);
  const [stripAnchor, setStripAnchor] = useState(stripAnchorRef.current);
  const [scrollTop, setScrollTop] = useState(0);
  const [gridReady, setGridReady] = useState(false);

  const stripDays = useMemo(
    () => buildDaysFrom(stripAnchor, STRIP_DAYS),
    [stripAnchor]
  );

  const [dragState, setDragState] = useState<EventDragState | null>(null);
  const dragStateRef = useRef<EventDragState | null>(null);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  dragStateRef.current = dragState;

  const handleEventDragStart = useCallback(
    (event: CalendarEvent, dayIndex: number, e: React.PointerEvent) => {
      if (event.cancelled) return;
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const coords = pointerToGridCoords(
        e.clientX,
        e.clientY,
        scrollEl,
        STRIP_DAYS
      );
      if (!coords) return;

      const startMinutes = minutesInTimeZone(event.startIso);
      const endMinutes = minutesInTimeZone(event.endIso);
      const eventTopPx = layout.minutesToGridPx(startMinutes);

      dragMovedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      const nextState: EventDragState = {
        event,
        pointerId: e.pointerId,
        durationMinutes: Math.max(endMinutes - startMinutes, SNAP_MINUTES),
        grabOffsetPx: coords.gridYPx - eventTopPx,
        dayIndex,
        startMinutes: snapMinutes(startMinutes),
      };
      dragStateRef.current = nextState;
      setDragState(nextState);
    },
    [layout]
  );

  useEffect(() => {
    const pointerId = dragState?.pointerId;
    if (pointerId === undefined) return;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleMove = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      e.preventDefault();

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragMovedRef.current = true;
      }

      const coords = pointerToGridCoords(
        e.clientX,
        e.clientY,
        scrollEl,
        STRIP_DAYS
      );
      if (!coords) return;

      const rawMinutes = gridPxToMinutes(
        coords.gridYPx - state.grabOffsetPx,
        layout
      );

      const nextState: EventDragState = {
        ...state,
        dayIndex: coords.dayIndex,
        startMinutes: snapMinutes(rawMinutes),
      };
      dragStateRef.current = nextState;
      setDragState(nextState);
    };

    const finishDrag = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;

      dragStateRef.current = null;
      setDragState(null);

      if (!dragMovedRef.current) {
        onSelectEvent(state.event);
        return;
      }

      const targetDay = buildDaysFrom(stripAnchorRef.current, STRIP_DAYS)[
        state.dayIndex
      ];
      if (!targetDay) return;

      const endMinutes = Math.min(
        state.startMinutes + state.durationMinutes,
        24 * 60 - 1
      );
      const newStartIso = minutesOnDayToIso(targetDay.dayIso, state.startMinutes);
      const newEndIso = minutesOnDayToIso(targetDay.dayIso, endMinutes);

      if (
        newStartIso === state.event.startIso &&
        newEndIso === state.event.endIso
      ) {
        return;
      }

      void onReschedule(state.event, newStartIso, newEndIso);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragState?.pointerId, layout, onReschedule, onSelectEvent]);

  const scrollToDay = useCallback((day: Date) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const dayWidth = scrollEl.clientWidth / VISIBLE_DAYS;
    if (dayWidth <= 0) return;

    const index = dayIndexFromAnchor(stripAnchorRef.current, day);
    const clamped = Math.max(
      0,
      Math.min(STRIP_DAYS - VISIBLE_DAYS, index - Math.floor(VISIBLE_DAYS / 2))
    );
    const left = clamped * dayWidth;

    scrollEl.scrollLeft = left;
    lastScrollLeftRef.current = left;
  }, []);

  const initializedRef = useRef(false);
  const lastNavTokenRef = useRef(0);

  useEffect(() => {
    if (initializedRef.current) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    initializedRef.current = true;
    scrollEl.scrollTop = focusBlockScrollOffset(scrollEl.clientHeight, layout);
    scrollToDay(navTarget);
    setGridReady(true);
  }, [layout, navTarget, scrollToDay]);

  useEffect(() => {
    if (navToken === 0 || navToken === lastNavTokenRef.current) return;
    lastNavTokenRef.current = navToken;
    stripAnchorRef.current = addDays(navTarget, -Math.floor(STRIP_DAYS / 2));
    setStripAnchor(stripAnchorRef.current);
    scrollToDay(navTarget);
  }, [navToken, navTarget, scrollToDay]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !gridReady) return;

    let frame = 0;

    const handleScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrollTop(scrollEl.scrollTop);

        if (scrollEl.scrollLeft === lastScrollLeftRef.current) return;

        lastScrollLeftRef.current = scrollEl.scrollLeft;
        const dayWidth = scrollEl.clientWidth / VISIBLE_DAYS;
        if (dayWidth <= 0) return;

        const firstVisibleIndex = Math.floor(scrollEl.scrollLeft / dayWidth);
        const visibleStart = addDays(stripAnchorRef.current, firstVisibleIndex);
        onVisibleStartChange(visibleStart);
      });
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scrollEl.removeEventListener("scroll", handleScroll);
    };
  }, [gridReady, onVisibleStartChange]);

  const stripWidthPercent = (STRIP_DAYS / VISIBLE_DAYS) * 100;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-12 shrink-0 flex-col border-r border-[#E1E4EA] bg-white">
          <div className="h-[58px] shrink-0 border-b border-[#E1E4EA] bg-[#FAFAFA]" />
          <div className="min-h-0 flex-1 overflow-hidden">
            <div
              style={{
                transform: `translateY(-${scrollTop}px)`,
                height: layout.gridHeight,
              }}
            >
              <TimeGutter layout={layout} />
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
        >
          <div
            className="relative min-w-full"
            style={{ width: `${stripWidthPercent}%` }}
          >
            <div
              className="sticky top-0 z-20 grid border-b border-[#E1E4EA] bg-[#FAFAFA]"
              style={{
                gridTemplateColumns: `repeat(${STRIP_DAYS}, minmax(0, 1fr))`,
              }}
            >
              {stripDays.map((day) => (
                <div
                  key={day.dayIso}
                  className={cn(
                    "border-l border-[#E1E4EA] px-2 py-2 text-center",
                    day.isToday && "bg-[#EBEEF4]"
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wide text-[#99A0AE]">
                    {day.weekdayShort}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[15px] tabular-nums",
                      day.isToday ? "font-medium text-[#335cff]" : "text-[#0E121B]"
                    )}
                  >
                    {day.label}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="relative"
              style={{ height: layout.gridHeight }}
            >
              <div
                className="grid h-full"
                style={{
                  gridTemplateColumns: `repeat(${STRIP_DAYS}, minmax(0, 1fr))`,
                  height: layout.gridHeight,
                }}
              >
                {stripDays.map((day, dayIndex) => (
                  <DayColumn
                    key={day.dayIso}
                    day={day}
                    dayIndex={dayIndex}
                    layout={layout}
                    events={events.filter(
                      (event) =>
                        event.id !== dragState?.event.id &&
                        eventOccursOnDay(event, day.dayIso)
                    )}
                    onEventDragStart={handleEventDragStart}
                  />
                ))}
              </div>

              {dragState ? (
                <EventDragPreview
                  layout={layout}
                  event={dragState.event}
                  dayIndex={dragState.dayIndex}
                  startMinutes={dragState.startMinutes}
                  durationMinutes={dragState.durationMinutes}
                />
              ) : null}

              {showInitialPlaceholder ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
                  <Loader2 className="h-5 w-5 animate-spin text-[#99A0AE]" />
                </div>
              ) : null}

              {refreshing && !showInitialPlaceholder ? (
                <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                  <span className="rounded-full border border-[#E1E4EA] bg-white/90 px-2 py-0.5 text-[10px] text-[#99A0AE] shadow-sm">
                    Termine werden aktualisiert…
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeGutter({ layout }: { layout: CalendarLayout }) {
  return (
    <div className="relative h-full" style={{ height: layout.gridHeight }}>
      {CALENDAR_HOURS.map((hour) => {
        const isFocus =
          hour >= CALENDAR_FOCUS_START_HOUR && hour <= CALENDAR_FOCUS_END_HOUR;
        const height = layout.hourHeight(hour);
        const top = layout.hourTop(hour);

        return (
          <div
            key={hour}
            className={cn(
              "absolute left-0 right-0 border-b",
              isFocus ? "border-[#E8EDF5]" : "border-[#F3F5F8]"
            )}
            style={{ top, height }}
          >
            <span
              className={cn(
                "absolute -top-[7px] right-1.5 tabular-nums",
                isFocus
                  ? "text-[10px] font-medium text-[#99A0AE]"
                  : "text-[9px] text-[#C5CAD3]"
              )}
            >
              {String(hour).padStart(2, "0")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DayColumn({
  day,
  dayIndex,
  events,
  layout,
  onEventDragStart,
}: {
  day: WeekDay;
  dayIndex: number;
  events: CalendarEvent[];
  layout: CalendarLayout;
  onEventDragStart: (
    event: CalendarEvent,
    dayIndex: number,
    e: React.PointerEvent<HTMLButtonElement>
  ) => void;
}) {
  return (
    <div
      className={cn(
        "relative h-full border-l border-[#E1E4EA]",
        day.isToday && "bg-[#FAFCFF]"
      )}
      style={{ height: layout.gridHeight }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bg-[#F8FAFC]/70"
        style={{
          top: layout.focusBandTop,
          height: layout.focusBandHeight,
        }}
      />

      {CALENDAR_HOURS.map((hour) => {
        const isFocus =
          hour >= CALENDAR_FOCUS_START_HOUR && hour <= CALENDAR_FOCUS_END_HOUR;
        return (
          <div
            key={hour}
            className={cn(
              "absolute left-0 right-0 border-b",
              isFocus ? "border-[#E8EDF5]" : "border-[#F3F5F8]"
            )}
            style={{
              top: layout.hourTop(hour),
              height: layout.hourHeight(hour),
            }}
          />
        );
      })}

      {events.map((event) => (
        <CalendarEventBlock
          key={event.id}
          event={event}
          layout={layout}
          onDragStart={(e) => onEventDragStart(event, dayIndex, e)}
        />
      ))}
    </div>
  );
}

function EventDragPreview({
  layout,
  event,
  dayIndex,
  startMinutes,
  durationMinutes,
}: {
  layout: CalendarLayout;
  event: CalendarEvent;
  dayIndex: number;
  startMinutes: number;
  durationMinutes: number;
}) {
  const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60 - 1);
  const top = layout.minutesToGridPx(startMinutes);
  const height = layout.durationToGridPx(startMinutes, endMinutes);
  const compact = height < 36 * layout.scale;

  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: `${(dayIndex / STRIP_DAYS) * 100}%`,
        width: `${100 / STRIP_DAYS}%`,
        top,
        height,
      }}
    >
      <div
        className={cn(
          "mx-0.5 h-full overflow-hidden rounded-md border border-[#1e3a8a]/50 bg-[#1e40af]/95 px-1.5 py-1 text-left text-white shadow-lg ring-2 ring-[#335cff]/40",
          compact ? "py-0.5" : "py-1"
        )}
      >
        <p
          className={cn(
            "font-medium leading-tight",
            compact ? "truncate text-[10px]" : "text-[11px] line-clamp-2"
          )}
        >
          {event.title}
        </p>
        {!compact ? (
          <p className="mt-0.5 truncate text-[10px] text-blue-100 tabular-nums">
            {formatMinutesLabel(startMinutes)} – {formatMinutesLabel(endMinutes)}
          </p>
        ) : (
          <p className="truncate text-[9px] text-blue-100 tabular-nums">
            {formatMinutesLabel(startMinutes)}
          </p>
        )}
      </div>
    </div>
  );
}

function CalendarEventBlock({
  event,
  layout,
  onDragStart,
}: {
  event: CalendarEvent;
  layout: CalendarLayout;
  onDragStart: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const startMinutes = minutesInTimeZone(event.startIso);
  const endMinutes = minutesInTimeZone(event.endIso);
  const top = layout.minutesToGridPx(startMinutes);
  const height = layout.durationToGridPx(startMinutes, endMinutes);
  const compact = height < 36 * layout.scale;

  return (
    <button
      data-event-block
      type="button"
      onPointerDown={onDragStart}
      className={cn(
        "absolute left-0.5 right-0.5 z-10 cursor-grab overflow-hidden rounded-md border border-[#1e3a8a]/30 bg-[#1e40af] px-1.5 py-1 text-left text-white shadow-sm transition-shadow active:cursor-grabbing",
        "hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#335cff]/50",
        event.cancelled && "opacity-60 line-through",
        compact ? "py-0.5" : "py-1"
      )}
      style={{ top, height, touchAction: "none" }}
      aria-label={`${event.title}, ${formatTime(event.startIso)} bis ${formatTime(event.endIso)}`}
    >
      <p
        className={cn(
          "font-medium leading-tight",
          compact ? "truncate text-[10px]" : "text-[11px] line-clamp-2"
        )}
      >
        {event.title}
      </p>
      {!compact ? (
        <p className="mt-0.5 truncate text-[10px] text-blue-100">
          {formatTime(event.startIso)} – {formatTime(event.endIso)}
        </p>
      ) : null}
      {event.linkerManaged ? (
        <span className="mt-0.5 block truncate text-[9px] text-blue-200/80">
          via Linker
        </span>
      ) : null}
    </button>
  );
}

function EventDetailDialog({
  event,
  mutating,
  onClose,
  onReschedule,
  onDelete,
}: {
  event: CalendarEvent | null;
  mutating: boolean;
  onClose: () => void;
  onReschedule: (
    event: CalendarEvent,
    startIso: string,
    endIso: string,
    title?: string
  ) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");

  useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    setStartLocal(isoToDatetimeLocal(event.startIso));
    setEndLocal(isoToDatetimeLocal(event.endIso));
  }, [event]);

  const handleSave = async () => {
    if (!event) return;
    const startIso = datetimeLocalToIso(startLocal);
    const endIso = datetimeLocalToIso(endLocal);
    await onReschedule(event, startIso, endIso, title);
  };

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {event ? (
          <>
            <DialogHeader>
              <DialogTitle
                className={cn(
                  "pr-8 text-[18px] font-medium leading-snug",
                  event.cancelled && "line-through opacity-70"
                )}
              >
                {event.title}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg bg-[#1e40af] px-4 py-3 text-white">
                <p className="text-[13px] text-blue-100">
                  {formatDateLong(event.startIso)}
                </p>
                <p className="mt-1 text-[20px] font-medium tabular-nums">
                  {formatTime(event.startIso)} – {formatTime(event.endIso)}
                </p>
                {event.linkerManaged ? (
                  <p className="mt-2 text-[11px] text-blue-200/80">via Linker gebucht</p>
                ) : null}
              </div>

              {event.cancelled ? (
                <p className="text-[13px] text-[#99A0AE]">Dieser Termin wurde storniert.</p>
              ) : (
                <div className="space-y-3 rounded-lg border border-[#E1E4EA] bg-[#FAFAFA] p-3">
                  <p className="text-[12px] font-medium text-[#525866]">Termin bearbeiten</p>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-[#99A0AE]">Titel</span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Titel des Termins"
                      className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE]"
                      disabled={mutating}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-[#99A0AE]">Beginn</span>
                    <input
                      type="datetime-local"
                      value={startLocal}
                      onChange={(e) => setStartLocal(e.target.value)}
                      className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
                      disabled={mutating}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-[#99A0AE]">Ende</span>
                    <input
                      type="datetime-local"
                      value={endLocal}
                      onChange={(e) => setEndLocal(e.target.value)}
                      className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
                      disabled={mutating}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center rounded bg-[#1e40af] text-[13px] text-white hover:bg-[#1e3a8a] disabled:opacity-60"
                    onClick={() => void handleSave()}
                    disabled={mutating || !title.trim()}
                  >
                    {mutating ? "Speichern…" : "Speichern"}
                  </button>
                  <p className="text-[11px] text-[#99A0AE]">
                    Tipp: Termine können auch per Drag &amp; Drop im Kalender verschoben werden.
                  </p>
                </div>
              )}

              {!event.cancelled ? (
                <button
                  type="button"
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded border border-red-200 bg-white text-[13px] text-red-700 hover:bg-red-50 disabled:opacity-60"
                  onClick={() => void onDelete(event)}
                  disabled={mutating}
                >
                  <Trash2 className="h-4 w-4" />
                  {mutating ? "Wird gelöscht…" : "Termin löschen"}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateEventDialog({
  open,
  mutating,
  onClose,
  onCreate,
}: {
  open: boolean;
  mutating: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    startIso: string;
    endIso: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startLocal, setStartLocal] = useState(defaultStartLocal);
  const [endLocal, setEndLocal] = useState(() =>
    defaultEndLocal(defaultStartLocal())
  );

  useEffect(() => {
    if (!open) return;
    const start = defaultStartLocal();
    setTitle("");
    setStartLocal(start);
    setEndLocal(defaultEndLocal(start));
  }, [open]);

  const handleStartChange = (value: string) => {
    setStartLocal(value);
    const startIso = datetimeLocalToIso(value);
    const endIso = new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString();
    const currentEnd = datetimeLocalToIso(endLocal);
    if (new Date(currentEnd) <= new Date(startIso)) {
      setEndLocal(isoToDatetimeLocal(endIso));
    }
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const startIso = datetimeLocalToIso(startLocal);
    const endIso = datetimeLocalToIso(endLocal);
    await onCreate({ title: trimmed, startIso, endIso });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium">
            Neuer Termin
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[#525866]">Titel</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Team-Meeting"
              className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-3 text-[13px] text-[#0E121B] placeholder:text-[#99A0AE]"
              disabled={mutating}
              autoFocus
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[#525866]">Beginn</span>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => handleStartChange(e.target.value)}
              className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
              disabled={mutating}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[#525866]">Ende</span>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="h-9 w-full rounded border border-[#E1E4EA] bg-white px-2 text-[13px] text-[#0E121B]"
              disabled={mutating}
            />
          </label>

          <p className="text-[11px] text-[#99A0AE]">
            Der Termin wird in Ihrem verbundenen Kalender gespeichert.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-9 flex-1 items-center justify-center rounded border border-[#E1E4EA] bg-white text-[13px] text-[#525866] hover:bg-[#F5F7FA] disabled:opacity-60"
              onClick={onClose}
              disabled={mutating}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="inline-flex h-9 flex-1 items-center justify-center rounded bg-[#1e40af] text-[13px] text-white hover:bg-[#1e3a8a] disabled:opacity-60"
              onClick={() => void handleSubmit()}
              disabled={mutating || !title.trim()}
            >
              {mutating ? "Speichern…" : "Termin erstellen"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
