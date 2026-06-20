import "server-only";

import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";

/** Thrown when the server isn't configured with an ElevenLabs API key. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "Kein ElevenLabs API-Schlüssel hinterlegt. Bitte ELEVENLABS_API_KEY in .env.local setzen."
    );
    this.name = "MissingApiKeyError";
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * Creates an authenticated ElevenLabs client. The SDK sends the key via the
 * `xi-api-key` header — it never leaves the server.
 */
export function getElevenLabsClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return new ElevenLabsClient({ apiKey });
}

function formatElevenLabsDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => formatElevenLabsDetail(entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length > 0 ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === "string") return record.msg;
    if (typeof record.message === "string") return record.message;
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Maps any thrown error to a friendly German message + HTTP status for the UI.
 */
export function describeElevenLabsError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof MissingApiKeyError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof ElevenLabsError) {
    const code = error.statusCode ?? 500;
    if (code === 401 || code === 403) {
      return {
        status: 401,
        message:
          "Der API-Schlüssel ist ungültig oder hat keine Berechtigung. Bitte überprüfen Sie ihn.",
      };
    }
    if (code === 429) {
      return {
        status: 429,
        message:
          "Zu viele Anfragen an ElevenLabs. Bitte versuchen Sie es in einem Moment erneut.",
      };
    }
    const detail =
      typeof error.body === "object" && error.body
        ? ((error.body as { detail?: unknown }).detail ?? null)
        : null;
    const formatted = formatElevenLabsDetail(detail);
    return {
      status: code >= 400 && code < 600 ? code : 502,
      message:
        formatted ??
        "ElevenLabs hat die Anfrage abgelehnt. Bitte überprüfen Sie Ihre Eingaben.",
    };
  }
  return {
    status: 500,
    message:
      "Unerwarteter Fehler bei der Verbindung mit ElevenLabs. Bitte versuchen Sie es erneut.",
  };
}
