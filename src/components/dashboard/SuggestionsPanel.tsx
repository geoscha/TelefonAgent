"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { EmptyState } from "@/components/brand/EmptyState";
import { SuggestionItem } from "@/components/dashboard/SuggestionItem";
import { Skeleton } from "@/components/ui/skeleton";
import { suggestionsService } from "@/lib/services";
import type { Suggestion } from "@/lib/types";

function SuggestionSkeleton() {
  return (
    <div className="border-l-[3px] border-divider px-6 py-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}

export function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    suggestionsService
      .listPendingSuggestions()
      .then((data) => {
        if (active) setSuggestions(data);
      })
      .catch(() => {
        toast.error("Vorschläge konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleAccept(id: string) {
    const target = suggestions.find((s) => s.id === id);
    setBusyId(id);
    // Optimistic: remove immediately.
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      await suggestionsService.acceptSuggestion(id);
      toast.success("Vorschlag angenommen", {
        description: target?.title,
        action: {
          label: "Rückgängig",
          onClick: () => {
            if (target) {
              setSuggestions((prev) =>
                [...prev, target].sort(
                  (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                )
              );
            }
          },
        },
      });
    } catch {
      // Reconcile: restore on failure.
      if (target) setSuggestions((prev) => [...prev, target]);
      toast.error("Aktion fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(id: string) {
    const target = suggestions.find((s) => s.id === id);
    setBusyId(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      await suggestionsService.dismissSuggestion(id);
      toast("Vorschlag verworfen", { description: target?.title });
    } catch {
      if (target) setSuggestions((prev) => [...prev, target]);
      toast.error("Aktion fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-card border border-stroke bg-surface">
        <div className="divide-y divide-divider">
          <SuggestionSkeleton />
          <SuggestionSkeleton />
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="overflow-hidden rounded-card border border-stroke bg-surface">
        <EmptyState
          illustration="phone"
          title="Keine offenen Vorschläge"
          description="Der Agent schlägt Aktionen vor, sobald neue Anrufe bearbeitet werden."
          gradient="warm"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-stroke bg-surface">
      <div className="divide-y divide-divider">
        <AnimatePresence initial={false}>
          {suggestions.map((suggestion) => (
            <motion.div
              key={suggestion.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <SuggestionItem
                suggestion={suggestion}
                busy={busyId === suggestion.id}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
