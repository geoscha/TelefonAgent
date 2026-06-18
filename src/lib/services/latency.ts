/**
 * Simulates network latency for the mock service layer so the UI behaves like
 * it's talking to a real backend (skeletons, optimistic updates, etc.).
 */
export function simulateLatency(min = 220, max = 520): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep clone so callers never mutate the in-memory store by reference. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
