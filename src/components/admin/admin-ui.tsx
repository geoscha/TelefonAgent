import { ExternalLink } from "lucide-react";

import { landingBtnSecondary } from "@/components/landing/landing-buttons";
import { TWILIO_BUY_PHONE_NUMBER_URL } from "@/lib/integrations/twilio-urls";
import { cn } from "@/lib/utils";

export const adminPanelClass =
  "landing-radius border border-[#E1E4EA] bg-white";

export const adminTableClass = "w-full text-left landing-body";

export const adminTableHeadClass =
  "border-b border-[#E1E4EA] bg-[#F5F7FA] landing-caption text-[#525866]";

export function AdminFilterPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "landing-radius-sm px-3 py-1.5 landing-caption transition-colors",
        active
          ? "bg-[#0E121B] text-white"
          : "border border-[#E1E4EA] text-[#525866] hover:text-[#0E121B]"
      )}
    >
      {children}
    </button>
  );
}

export function TwilioBuyNumberLink({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <a
      href={TWILIO_BUY_PHONE_NUMBER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        landingBtnSecondary,
        compact && "min-h-8 px-2.5",
        className
      )}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Neue Twilio-Nummer
    </a>
  );
}

export function AdminStat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "landing-radius border px-3 py-2",
        accent
          ? "border-[#335cff]/25 bg-[#335cff]/5"
          : "border-[#E1E4EA] bg-white"
      )}
    >
      <p className="landing-caption text-[#525866]">{label}</p>
      <p className="mt-0.5 landing-body font-medium text-[#0E121B] tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 landing-caption text-[#99A0AE]">{hint}</p>
      )}
    </div>
  );
}
