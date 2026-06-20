import type { Call, SuggestedAction, TranscriptLine } from "@/lib/types";

/** Exact phrase the agent must say when offering a callback (live calls). */
export const CALLBACK_PROMISE_MESSAGE =
  "Ich leite Ihr Anliegen weiter. Sie werden von uns zurückgerufen.";

export const CALLBACK_LIST_TITLE = "Rückruf erforderlich";

const HUMAN_REQUEST_PATTERNS = [
  /mit\s+(einem\s+)?(menschen|mitarbeiter|person)/i,
  /jemand(en)?\s+(echt|persönlich|am\s+telefon)/i,
  /zurück\s*rufen/i,
  /rückruf/i,
  /chef/i,
  /management/i,
  /verbind(en|e)\s+(mich|bitte)/i,
];

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Detects whether the agent promised a human callback during the call. */
export function detectCallbackRequired(transcript: TranscriptLine[]): boolean {
  const agentLines = transcript
    .filter((line) => line.speaker === "Agent")
    .map((line) => normalizeForMatch(line.text));

  const callerLines = transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => normalizeForMatch(line.text));

  const promise = normalizeForMatch(CALLBACK_PROMISE_MESSAGE);
  const agentCombined = agentLines.join(" ");

  if (agentCombined.includes(promise)) return true;

  const agentPromisedCallback =
    agentCombined.includes("zurückgerufen") &&
    (agentCombined.includes("anliegen") || agentCombined.includes("weiter"));

  if (agentPromisedCallback) return true;

  const callerAskedHuman = callerLines.some((line) =>
    HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(line))
  );

  return (
    callerAskedHuman &&
    agentCombined.includes("zurück") &&
    !agentCombined.includes("verbinde sie mit")
  );
}

export function applyCallbackRequiredToCall<T extends Call>(call: T): T {
  if (!detectCallbackRequired(call.transcript)) return call;

  const suggestedActions: SuggestedAction[] = [...call.suggestedActions];
  if (!suggestedActions.some((action) => action.type === "Rückruf")) {
    suggestedActions.unshift({
      id: `callback-${call.id}`,
      label: "Rückruf vereinbaren",
      type: "Rückruf",
      status: "offen",
    });
  }

  const noteLine = `Rückruf vereinbart — Anrufernummer: ${call.callerPhone}`;

  return {
    ...call,
    title: CALLBACK_LIST_TITLE,
    callbackRequired: true,
    summary: call.summary?.trim()
      ? `${call.summary.trim()}\n\n${noteLine}`
      : noteLine,
    structuredSummary: {
      ...call.structuredSummary,
      notes: call.structuredSummary.notes?.trim()
        ? `${call.structuredSummary.notes.trim()}\n${noteLine}`
        : noteLine,
      callbackRequired: true,
    },
    suggestedActions,
  };
}
