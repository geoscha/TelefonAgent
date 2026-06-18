import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Call } from "@/lib/types";
import { formatTime } from "@/lib/utils";

export function CallRow({ call }: { call: Call }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 lg:px-8">
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[16px] font-semibold leading-tight text-navy">
          {call.title}
        </p>
      </div>

      <p className="shrink-0 text-[13px] tabular-nums text-text-muted">
        {formatTime(call.startedAt)}
      </p>

      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link href={`/anrufe/${call.id}`}>
          Details
          <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
        </Link>
      </Button>
    </div>
  );
}
