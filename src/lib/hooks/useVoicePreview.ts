"use client";

import { useCallback, useEffect, useRef } from "react";

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

function stopActivePreview() {
  activeAudio?.pause();
  activeAudio = null;
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export type VoicePreviewResult =
  | { ok: true }
  | { ok: false; error?: string; insufficientTokens?: boolean };

export function useVoicePreview() {
  const abortRef = useRef<AbortController | null>(null);

  const stopPreview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopActivePreview();
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  const previewVoice = useCallback(
    async (
      voiceId: string,
      voiceName: string,
      language?: string,
      text?: string
    ): Promise<VoicePreviewResult> => {
      stopPreview();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/elevenlabs/voices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId, voiceName, language, text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let error: string | undefined;
          let insufficientTokens = res.status === 402;
          try {
            const data = (await res.json()) as {
              error?: string;
              insufficientTokens?: boolean;
            };
            error = data.error;
            insufficientTokens =
              insufficientTokens || Boolean(data.insufficientTokens);
          } catch {
            /* non-json error */
          }
          return { ok: false, error, insufficientTokens };
        }

        const blob = await res.blob();
        if (!blob.size || (blob.type && !blob.type.startsWith("audio/"))) {
          return { ok: false };
        }

        const url = URL.createObjectURL(blob);
        activeUrl = url;
        const audio = new Audio(url);
        activeAudio = audio;

        audio.onended = () => stopPreview();
        audio.onerror = () => stopPreview();
        try {
          await audio.play();
        } catch {
          stopPreview();
          return { ok: false };
        }
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [stopPreview]
  );

  return { previewVoice, stopPreview };
}
