import "server-only";

import type { GetConversationResponseModel } from "@elevenlabs/elevenlabs-js/api/types/GetConversationResponseModel";

import { enrichCall } from "@/lib/enrichment";
import type { Call, TranscriptLine } from "@/lib/types";

/** Raw shape of the post-call webhook payload (snake_case). */
export interface WebhookCallData {
  conversation_id?: string;
  agent_id?: string;
  transcript?: Array<{
    role?: string;
    message?: string | null;
    time_in_call_secs?: number;
  }>;
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    phone_call?: {
      external_number?: string;
      phone_number_id?: string;
      agent_number?: string;
    };
  };
  analysis?: {
    transcript_summary?: string;
    call_summary_title?: string;
    data_collection_results?: Record<
      string,
      { value?: unknown; rationale?: string }
    >;
  };
}

export async function buildCallFromWebhook(
  data: WebhookCallData
): Promise<Call> {
  const turns = data.transcript ?? [];

  const transcript: TranscriptLine[] = turns
    .filter((t) => t.message && t.message.trim().length > 0)
    .map((t) => ({
      speaker: t.role === "agent" ? "Agent" : "Anrufer",
      text: (t.message ?? "").trim(),
      timestamp: formatOffset(t.time_in_call_secs ?? 0),
    }));

  const transcriptText = transcript
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");

  const startUnix = data.metadata?.start_time_unix_secs;
  const startedAt = startUnix
    ? new Date(startUnix * 1000).toISOString()
    : new Date().toISOString();
  const durationSeconds = data.metadata?.call_duration_secs ?? 0;
  const callerPhone =
    data.metadata?.phone_call?.external_number ?? "Unbekannt";

  const collected = data.analysis?.data_collection_results ?? {};
  const property =
    findCollected(collected, [
      "objekt",
      "object",
      "adresse",
      "address",
      "liegenschaft",
      "property",
    ]) ?? "Unbekannt";

  const enrichment = await enrichCall({
    transcriptText,
    fallbackTitle: data.analysis?.call_summary_title,
    fallbackSummary: data.analysis?.transcript_summary,
  });

  const callerName =
    findCollected(collected, ["name", "caller", "mieter", "anrufer"]) ??
    enrichment.callerName;

  return {
    id: data.conversation_id ?? `call-${Date.now()}`,
    title: enrichment.title,
    callerName,
    callerPhone,
    property,
    startedAt,
    durationSeconds,
    summary: enrichment.summary,
    category: enrichment.category,
    urgency: enrichment.urgency,
    status: enrichment.category === "Notfall" ? "eskaliert" : "offen",
    transcript,
    structuredSummary: {
      tenant: callerName,
      property,
      concernType: enrichment.category,
      urgency: enrichment.urgency,
      notes: enrichment.summary,
    },
    suggestedActions: enrichment.suggestedActions,
  };
}

export async function buildCallFromConversation(
  conv: GetConversationResponseModel
): Promise<Call> {
  const transcript: TranscriptLine[] = (conv.transcript ?? [])
    .filter((t) => t.message && t.message.trim().length > 0)
    .map((t) => ({
      speaker: t.role === "agent" ? "Agent" : "Anrufer",
      text: (t.message ?? "").trim(),
      timestamp: formatOffset(t.timeInCallSecs ?? 0),
    }));

  const transcriptText = transcript
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");

  const meta = conv.metadata;
  const startedAt = new Date(meta.startTimeUnixSecs * 1000).toISOString();
  const durationSeconds = meta.callDurationSecs ?? 0;
  const callerPhone = extractCallerPhone(meta.phoneCall) ?? "Unbekannt";

  const collected = conv.analysis?.dataCollectionResults ?? {};
  const property =
    findCollected(collected, [
      "objekt",
      "object",
      "adresse",
      "address",
      "liegenschaft",
      "property",
    ]) ?? "Unbekannt";

  const enrichment = await enrichCall({
    transcriptText,
    fallbackTitle: conv.analysis?.callSummaryTitle,
    fallbackSummary: conv.analysis?.transcriptSummary,
  });

  const callerName =
    findCollected(collected, ["name", "caller", "mieter", "anrufer"]) ??
    enrichment.callerName;

  return {
    id: conv.conversationId,
    title: enrichment.title,
    callerName,
    callerPhone,
    property,
    startedAt,
    durationSeconds,
    summary: enrichment.summary,
    category: enrichment.category,
    urgency: enrichment.urgency,
    status: enrichment.category === "Notfall" ? "eskaliert" : "offen",
    transcript,
    structuredSummary: {
      tenant: callerName,
      property,
      concernType: enrichment.category,
      urgency: enrichment.urgency,
      notes: enrichment.summary,
    },
    suggestedActions: enrichment.suggestedActions,
  };
}

function extractCallerPhone(
  phoneCall?: GetConversationResponseModel["metadata"]["phoneCall"]
): string | undefined {
  if (!phoneCall) return undefined;
  if ("externalNumber" in phoneCall && phoneCall.externalNumber) {
    return phoneCall.externalNumber;
  }
  return undefined;
}

function findCollected(
  results: Record<string, { value?: unknown }>,
  keys: string[]
): string | undefined {
  for (const [key, entry] of Object.entries(results)) {
    if (keys.some((k) => key.toLowerCase().includes(k))) {
      if (typeof entry?.value === "string" && entry.value.trim()) {
        return entry.value.trim();
      }
    }
  }
  return undefined;
}

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
