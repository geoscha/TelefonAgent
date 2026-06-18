"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de-CH">
      <body className="bg-[#050f1f] text-white antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold">Kritischer Fehler</h1>
          <p className="max-w-md text-[15px] text-white/70">
            Die Anwendung konnte nicht geladen werden.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-white px-4 py-2 text-[14px] font-medium text-[#050f1f]"
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
