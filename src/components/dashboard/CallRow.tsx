"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CalendarPlus,
  CheckSquare,
  PhoneForwarded,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { Call, SuggestionType } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

const actionIcons: Record<SuggestionType, typeof CalendarPlus> = {
  Kalendereintrag: CalendarPlus,
  Aufgabe: CheckSquare,
  Rückruf: PhoneForwarded,
  Eskalation: AlertTriangle,
};

export function CallRow({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);

  const isUrgent = call.urgency === "hoch" || call.category === "Notfall";
  const callerName = call.callerName ?? call.callerPhone;
  const shortProperty = call.property.split(",")[0];

  return (
    <div className="relative">
      {/* Urgency indicator — orange for Hoch/Notfall, muted for normal */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          isUrgent ? "bg-accent" : "bg-divider"
        )}
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-baby-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 lg:px-8"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-[16px] font-semibold leading-tight text-navy">
            {call.title}
          </p>
          <p className="mt-1 truncate text-[13px] leading-none text-text-muted">
            {callerName} · {shortProperty} · {formatTime(call.startedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {call.category === "Notfall" && (
            <span className="rounded-btn bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">
              Notfall
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 stroke-[1.5] text-text-muted transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 lg:px-8">
              <p className="max-w-2xl text-[15px] leading-relaxed text-text">
                {call.summary}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {call.suggestedActions.map((action, i) => {
                  const Icon = actionIcons[action.type];
                  return (
                    <Button
                      key={action.id}
                      size="sm"
                      variant={i === 0 ? "default" : "outline"}
                    >
                      <Icon className="h-3.5 w-3.5 stroke-[1.5]" />
                      {action.label}
                    </Button>
                  );
                })}
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/anrufe/${call.id}`}>
                    Anruf öffnen
                    <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
