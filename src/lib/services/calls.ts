import type { Call } from "@/lib/types";
import { mockCalls } from "@/lib/mock/calls";
import { clone, simulateLatency } from "@/lib/services/latency";

// TODO(integration): replace with Supabase `calls` queries; transcripts/recordings
// originate from the Twilio → ElevenLabs pipeline.
const store: Call[] = clone(mockCalls);

export async function listCalls(): Promise<Call[]> {
  await simulateLatency();
  return clone(store);
}

export async function getCall(id: string): Promise<Call | null> {
  await simulateLatency(140, 320);
  return clone(store.find((c) => c.id === id) ?? null);
}

export async function getRecentCalls(limit = 10): Promise<Call[]> {
  await simulateLatency();
  const sorted = [...store].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return clone(sorted.slice(0, limit));
}
