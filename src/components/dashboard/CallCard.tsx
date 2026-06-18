import Link from "next/link";
import {
  CalendarPlus,
  CheckSquare,
  PhoneForwarded,
  AlertTriangle,
} from "lucide-react";
import { AvatarGradient } from "@/components/brand/AvatarGradient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Call, CallCategory, Urgency } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/utils";

const categoryVariant: Record<
  CallCategory,
  "schaden" | "mietzins" | "besichtigung" | "allgemein" | "notfall"
> = {
  Schadenmeldung: "schaden",
  Mietzins: "mietzins",
  Besichtigung: "besichtigung",
  Allgemein: "allgemein",
  Notfall: "notfall",
};

const urgencyLabel: Record<Urgency, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
};

const actionIcons = {
  Kalendereintrag: CalendarPlus,
  Aufgabe: CheckSquare,
  Rückruf: PhoneForwarded,
  Eskalation: AlertTriangle,
};

interface CallCardProps {
  call: Call;
}

export function CallCard({ call }: CallCardProps) {
  const displayName = call.callerName ?? call.callerPhone;

  return (
    <article className="px-6 py-6 transition-colors hover:bg-baby-blue/20 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <AvatarGradient name={displayName} size="md" className="hidden sm:flex" />
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={`/anrufe/${call.id}`}
                className="font-sans font-semibold text-[22px] leading-tight text-navy hover:text-accent transition-colors"
              >
                {displayName}
              </Link>
              <CategoryBadge category={call.category} />
              {call.urgency === "hoch" && (
                <Badge variant="urgent">{urgencyLabel[call.urgency]}</Badge>
              )}
            </div>

            <p className="text-caption text-text-muted">{call.property}</p>

            <p className="max-w-2xl text-body leading-relaxed text-text">
              {call.summary}
            </p>

            <p className="text-caption text-text-muted">
              {formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)}
            </p>
          </div>
        </div>

        {call.suggestedActions.length > 0 && (
          <div className="flex shrink-0 flex-col gap-2 lg:w-52">
            {call.suggestedActions.map((action) => {
              const Icon = actionIcons[action.type];
              return (
                <Button
                  key={action.id}
                  variant="secondary"
                  size="sm"
                  className="justify-start text-caption font-medium"
                >
                  <Icon className="h-3.5 w-3.5 stroke-[1.5] text-text-muted" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

export function CategoryBadge({ category }: { category: CallCategory }) {
  return (
    <Badge variant={categoryVariant[category]}>
      {category}
    </Badge>
  );
}
