"use client";

import { addDaysToDayIso, toDayIso } from "@/lib/calendar/week-view";
import {
  CACHE_KEYS,
  prefetchStaleCache,
  sessionThrottle,
} from "@/lib/client/stale-cache";
import type {
  CustomerDataProviderId,
  CustomerWithAppointments,
} from "@/lib/customers/types";
import type { MessageChannel } from "@/lib/messages/types";
import type { Call } from "@/lib/types";

const STRIP_DAYS = 42;

export interface CustomersFeed {
  customers: CustomerWithAppointments[];
  craftsmen: CustomerWithAppointments[];
  connected: boolean;
  calendarConnected: boolean;
  lastSyncedAt: string | null;
  sourceReady: boolean;
  activeProvider: CustomerDataProviderId | null;
}

async function fetchCustomersFeed(): Promise<CustomersFeed> {
  const res = await fetch("/api/customers");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("customers load failed");
  return {
    customers: (data.customers ?? []) as CustomerWithAppointments[],
    craftsmen: (data.craftsmen ?? []) as CustomerWithAppointments[],
    connected: Boolean(data.connected),
    calendarConnected: Boolean(data.calendarConnected),
    lastSyncedAt: (data.lastSyncedAt as string | undefined) ?? null,
    sourceReady: Boolean(data.sourceReady),
    activeProvider:
      (data.activeProvider as CustomerDataProviderId | undefined) ?? null,
  };
}

async function fetchMessagesChannels(): Promise<MessageChannel[]> {
  const res = await fetch("/api/messages/channels");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("channels load failed");
  return (data.channels ?? []) as MessageChannel[];
}

async function fetchCallsFeed(): Promise<Call[]> {
  const res = await fetch("/api/calls");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("calls load failed");
  return data.calls as Call[];
}

function defaultCalendarRange(centerDate = new Date()) {
  const center = new Date(centerDate);
  center.setHours(12, 0, 0, 0);
  const anchor = new Date(center);
  anchor.setDate(anchor.getDate() - Math.floor(STRIP_DAYS / 2));
  const anchorIso = toDayIso(anchor);
  return {
    from: addDaysToDayIso(anchorIso, -1),
    to: addDaysToDayIso(anchorIso, STRIP_DAYS + 1),
  };
}

async function fetchCalendarFeed(from: string, to: string) {
  const res = await fetch(
    `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("calendar load failed");
  return data;
}

export function prefetchCustomersFeed() {
  return prefetchStaleCache(CACHE_KEYS.customers, fetchCustomersFeed);
}

async function fetchCustomerSourceConfig() {
  const res = await fetch("/api/customers/source");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("customer source load failed");
  return data;
}

export function prefetchCustomerSourceConfig() {
  return prefetchStaleCache(CACHE_KEYS.customerSource, fetchCustomerSourceConfig);
}

export function prefetchMessagesChannels() {
  return prefetchStaleCache(CACHE_KEYS.messagesChannels, fetchMessagesChannels);
}

export function prefetchCallsFeed() {
  return prefetchStaleCache(CACHE_KEYS.calls, fetchCallsFeed);
}

export function prefetchCalendarFeed(centerDate = new Date()) {
  const { from, to } = defaultCalendarRange(centerDate);
  return prefetchStaleCache(CACHE_KEYS.calendarEvents(from, to), () =>
    fetchCalendarFeed(from, to)
  );
}

/** Warm common tab caches once per session shortly after app open. */
export function prefetchCoreTabs() {
  if (!sessionThrottle("tab-prefetch-core", 30_000)) return;

  void prefetchCallsFeed();
  void prefetchCustomersFeed();
  void prefetchCustomerSourceConfig();
  void prefetchMessagesChannels();
  void prefetchCalendarFeed();
}

const TAB_PREFETCH_BY_HREF: Record<string, () => void> = {
  "/anrufe": () => void prefetchCallsFeed(),
  "/nachrichten": () => void prefetchMessagesChannels(),
  "/kunden": () => {
    void prefetchCustomersFeed();
    void prefetchCustomerSourceConfig();
  },
  "/kalender": () => void prefetchCalendarFeed(),
};

export function prefetchTabForHref(href: string) {
  TAB_PREFETCH_BY_HREF[href]?.();
}
