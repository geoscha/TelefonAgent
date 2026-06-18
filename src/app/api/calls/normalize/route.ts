import { NextResponse } from "next/server";

import { enrichCall } from "@/lib/enrichment";
import { getStoredCalls, saveCalls } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Maintenance: re-derive German title / summary / caller name for all stored
 * calls from their (German) transcripts. Useful after the German-guarantee
 * change to clean up older entries that carried English ElevenLabs analysis.
 */
export async function POST() {
  const calls = await getStoredCalls();
  let updated = 0;

  const next = await Promise.all(
    calls.map(async (call) => {
      const transcriptText = (call.transcript ?? [])
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n");
      if (!transcriptText.trim()) return call;

      const e = await enrichCall({ transcriptText });
      updated += 1;
      const callerName = call.callerName || e.callerName;
      return {
        ...call,
        title: e.title,
        summary: e.summary,
        category: e.category,
        urgency: e.urgency,
        callerName,
        structuredSummary: {
          ...call.structuredSummary,
          tenant: callerName,
          concernType: e.category,
          urgency: e.urgency,
          notes: e.summary,
        },
      };
    })
  );

  await saveCalls(next);
  return NextResponse.json({ ok: true, updated });
}
