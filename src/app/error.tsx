"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <h1 className="font-sans text-2xl font-semibold text-navy">
        Etwas ist schiefgelaufen
      </h1>
      <p className="max-w-md text-[15px] text-text-muted">
        Bitte laden Sie die Seite neu. Falls das Problem bleibt, starten Sie den
        Entwicklungsserver neu.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-btn bg-accent px-4 py-2 text-[14px] font-medium text-white hover:bg-navy"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
