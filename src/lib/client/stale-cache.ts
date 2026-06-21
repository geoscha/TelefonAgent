/** Client-side stale-while-revalidate cache (memory + sessionStorage). */

const memory = new Map<string, { data: unknown; fetchedAt: number }>();

export const STALE_CACHE_UPDATED_EVENT = "linker:stale-cache-updated";

export const CACHE_KEYS = {
  customers: "customers-feed",
  messagesChannels: "messages-channels",
  calls: "calls-feed",
  workspace: "workspace",
  messagesThreads: (channelId: string) => `messages-threads:${channelId}`,
  messagesThread: (threadId: string) => `messages-thread:${threadId}`,
  messagesInquiries: (channelId: string) => `messages-inquiries:${channelId}`,
  calendarEvents: (from: string, to: string) => `calendar-events:${from}:${to}`,
  customerSource: "customer-source-config",
} as const;

function storageKey(key: string): string {
  return `linker:cache:${key}`;
}

function getCacheEntry<T>(key: string): { data: T; fetchedAt: number } | null {
  const mem = memory.get(key);
  if (mem) return mem as { data: T; fetchedAt: number };

  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; fetchedAt: number };
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Returns cached data regardless of age — for instant tab paint. */
export function readCached<T>(key: string): T | null {
  return getCacheEntry<T>(key)?.data ?? null;
}

export function isCacheFresh(key: string, maxAgeMs: number): boolean {
  const entry = getCacheEntry(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt <= maxAgeMs;
}

/** @deprecated Prefer readCached + isCacheFresh. Kept for callers that need TTL-gated reads. */
export function readStaleCache<T>(key: string, maxAgeMs = 120_000): T | null {
  if (!isCacheFresh(key, maxAgeMs)) return null;
  return readCached<T>(key);
}

export function writeStaleCache<T>(key: string, data: T): void {
  const entry = { data, fetchedAt: Date.now() };
  memory.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
    window.dispatchEvent(
      new CustomEvent(STALE_CACHE_UPDATED_EVENT, { detail: { key } })
    );
  } catch {
    /* quota */
  }
}

export async function prefetchStaleCache<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T | null> {
  try {
    const next = await fetcher();
    writeStaleCache(key, next);
    return next;
  } catch {
    return readCached<T>(key);
  }
}

export function invalidateStaleCache(key: string): void {
  memory.delete(key);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(key));
    window.dispatchEvent(
      new CustomEvent(STALE_CACHE_UPDATED_EVENT, { detail: { key } })
    );
  } catch {
    /* ignore */
  }
}

export function sessionThrottle(key: string, intervalMs: number): boolean {
  if (typeof window === "undefined") return false;
  const raw = sessionStorage.getItem(`linker:throttle:${key}`);
  const last = raw ? Number(raw) : 0;
  if (Date.now() - last < intervalMs) return false;
  sessionStorage.setItem(`linker:throttle:${key}`, String(Date.now()));
  return true;
}
