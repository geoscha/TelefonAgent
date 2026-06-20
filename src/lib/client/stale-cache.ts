/** Client-side stale-while-revalidate cache (memory + sessionStorage). */

const memory = new Map<string, { data: unknown; fetchedAt: number }>();

function storageKey(key: string): string {
  return `linker:cache:${key}`;
}

export function readStaleCache<T>(key: string, maxAgeMs = 120_000): T | null {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.fetchedAt <= maxAgeMs) {
    return mem.data as T;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; fetchedAt: number };
    if (now - parsed.fetchedAt > maxAgeMs) return null;
    memory.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeStaleCache<T>(key: string, data: T): void {
  const entry = { data, fetchedAt: Date.now() };
  memory.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function invalidateStaleCache(key: string): void {
  memory.delete(key);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(key));
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
