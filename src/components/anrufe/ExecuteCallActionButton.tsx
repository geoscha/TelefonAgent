"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Call } from "@/lib/types";

export function ExecuteCallActionButton({ call }: { call: Call }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const hasOpenCalendarAction = call.suggestedActions.some(
    (action) =>
      action.type === "Kalendereintrag" && action.status !== "erledigt"
  );

  if (!hasOpenCalendarAction) return null;

  async function executeAction() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/execute-action`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };

      if (!res.ok || !data.ok) {
        toast.error("Aktion fehlgeschlagen", {
          description: data.error ?? "Bitte später erneut versuchen.",
        });
        return;
      }

      toast.success("Kalendereintrag erstellt", {
        description: data.message,
      });
      router.refresh();
    } catch {
      toast.error("Netzwerkfehler beim Ausführen der Aktion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      className="w-full"
      size="sm"
      disabled={busy}
      onClick={() => void executeAction()}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Wird eingetragen…
        </>
      ) : (
        "Aktion ausführen"
      )}
    </Button>
  );
}
