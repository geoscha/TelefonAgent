"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { landingBtnGhost } from "@/components/landing/landing-buttons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeleteCallButtonProps = {
  callId: string;
  redirectTo?: string;
  onDeleted?: () => void;
  variant?: "icon" | "button";
  className?: string;
};

export function DeleteCallButton({
  callId,
  redirectTo,
  onDeleted,
  variant = "button",
  className,
}: DeleteCallButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function deleteCall() {
    const confirmed = window.confirm(
      "Diesen Anruf wirklich aus dem Verlauf löschen? Das kann nicht rückgängig gemacht werden."
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${callId}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        toast.error("Löschen fehlgeschlagen", {
          description: data.error ?? "Bitte später erneut versuchen.",
        });
        return;
      }

      toast.success("Anruf gelöscht");
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      toast.error("Netzwerkfehler beim Löschen.");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Anruf löschen"
        disabled={busy}
        onClick={() => void deleteCall()}
        className={cn(
          landingBtnGhost,
          "shrink-0 px-2.5 text-[#525866] hover:text-red-600",
          className
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void deleteCall()}
      className={cn("gap-2 text-red-600 hover:text-red-700", className)}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 stroke-[1.5]" />
      )}
      Anruf löschen
    </Button>
  );
}
