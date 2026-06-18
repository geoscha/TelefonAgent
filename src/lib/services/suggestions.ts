import type { Suggestion, SuggestionStatus } from "@/lib/types";
import { mockSuggestions } from "@/lib/mock/suggestions";
import { clone, simulateLatency } from "@/lib/services/latency";

// In-memory store — mutated during the session to simulate a backend.
// TODO(integration): replace with Supabase `suggestions` table queries.
let store: Suggestion[] = clone(mockSuggestions);

export async function listSuggestions(): Promise<Suggestion[]> {
  await simulateLatency();
  return clone(store);
}

export async function listPendingSuggestions(): Promise<Suggestion[]> {
  await simulateLatency();
  return clone(store.filter((s) => s.status === "pending"));
}

async function setStatus(
  id: string,
  status: SuggestionStatus
): Promise<Suggestion> {
  await simulateLatency(160, 380);
  const next = store.map((s) => (s.id === id ? { ...s, status } : s));
  store = next;
  const updated = next.find((s) => s.id === id);
  if (!updated) throw new Error(`Vorschlag ${id} nicht gefunden`);
  return clone(updated);
}

export function acceptSuggestion(id: string): Promise<Suggestion> {
  return setStatus(id, "accepted");
}

export function dismissSuggestion(id: string): Promise<Suggestion> {
  return setStatus(id, "dismissed");
}

/** Test seam: reset the in-memory store to seed data. */
export function __resetSuggestions(): void {
  store = clone(mockSuggestions);
}
