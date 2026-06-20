import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { DeleteCallButton } from "@/components/anrufe/DeleteCallButton";
import { landingBtnGhost } from "@/components/landing/landing-buttons";
import { userTitleClass } from "@/components/user/user-styles";
import type { Call } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

function screeningLabel(call: Call): string | null {
  if (call.callbackRequired) return null;
  if (!call.screening) return "Wird analysiert…";
  if (call.screening.status === "pending") return "Wird analysiert…";
  if (call.screening.appointmentBooked) return "Termin eingetragen";
  if (call.screening.appointmentAttempted) return "Kein Termin";
  if (call.callerPhone === "Chat") return "Chat";
  return null;
}

export function CallRow({
  call,
  onDeleted,
}: {
  call: Call;
  onDeleted?: () => void;
}) {
  const status = screeningLabel(call);
  const callbackRequired = Boolean(call.callbackRequired);

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-5 py-3.5 lg:px-6",
        callbackRequired &&
          "border border-[#335cff] bg-[#335cff]/[0.04] shadow-[inset_0_0_0_1px_rgba(51,92,255,0.15)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            userTitleClass,
            "truncate",
            callbackRequired && "text-[#335cff]"
          )}
        >
          {call.title}
        </p>
        {callbackRequired ? (
          <p className="mt-0.5 truncate font-mono text-[12px] text-[#335cff]">
            {call.callerPhone}
          </p>
        ) : status ? (
          <p className="mt-0.5 truncate text-[12px] text-[#525866]">{status}</p>
        ) : null}
      </div>

      <p className="shrink-0 text-[13px] tabular-nums text-[#525866]">
        {formatTime(call.startedAt)}
      </p>

      <DeleteCallButton
        callId={call.id}
        variant="icon"
        onDeleted={onDeleted}
      />

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
