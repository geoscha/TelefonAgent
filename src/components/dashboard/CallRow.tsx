import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { landingBtnGhost } from "@/components/landing/landing-buttons";
import { userTitleClass } from "@/components/user/user-styles";
import type { Call } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

export function CallRow({ call }: { call: Call }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 lg:px-6">
      <div className="min-w-0 flex-1">
        <p className={cn(userTitleClass, "truncate")}>{call.title}</p>
      </div>

      <p className="shrink-0 text-[13px] tabular-nums text-[#525866]">
        {formatTime(call.startedAt)}
      </p>

      <Link
        href={`/anrufe/${call.id}`}
        className={cn(landingBtnGhost, "shrink-0 gap-1 px-2.5")}
      >
        Details
        <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
      </Link>
    </div>
  );
}
