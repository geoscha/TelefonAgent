"use client";

import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface SuggestionItemProps {
  suggestion: Suggestion;
  busy?: boolean;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function SuggestionItem({
  suggestion,
  busy = false,
  onAccept,
  onDismiss,
}: SuggestionItemProps) {
  return (
    <article className="border-l-[3px] border-accent px-6 py-6">
      <p className="label-caps">{suggestion.type}</p>
      <p className="mt-1 font-sans font-semibold text-[22px] leading-tight text-navy">
        {suggestion.title}
      </p>
      <p className="mt-2 text-body text-text-muted">{suggestion.description}</p>

      {suggestion.prefilledData && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
          {Object.entries(suggestion.prefilledData).map(([key, value]) => (
            <div key={key}>
              <dt className="label-caps">{key}</dt>
              <dd className="mt-0.5 text-body font-medium text-text">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-caption text-text-muted">
        {formatDateTime(suggestion.createdAt)}
      </p>

      <div className="mt-5 flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onAccept(suggestion.id)}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[1.5]" />
          ) : (
            <Check className="h-3.5 w-3.5 stroke-[1.5]" />
          )}
          Annehmen
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onDismiss(suggestion.id)}
        >
          <X className="h-3.5 w-3.5 stroke-[1.5]" />
          Ablehnen
        </Button>
      </div>
    </article>
  );
}
