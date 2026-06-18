import { cn } from "@/lib/utils";

export const agentModalPanelClass =
  "relative w-full max-w-[680px] max-h-[90vh] overflow-y-auto rounded-[22px] border border-stroke bg-white p-7 sm:p-10 shadow-[0_24px_64px_-24px_rgba(20,36,46,0.18)]";

export const agentModalTitleClass =
  "font-sans text-[26px] font-semibold leading-tight text-navy";

export const agentModalLabelClass = "text-[13px] font-medium text-text-muted";

export const agentModalInputClass =
  "flex h-10 w-full rounded-[14px] border border-stroke bg-surface px-4 text-[14px] text-navy placeholder:text-text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

export const agentModalTextareaClass =
  "flex min-h-[72px] w-full resize-y rounded-[14px] border border-stroke bg-surface px-4 py-3 text-[14px] leading-relaxed text-navy placeholder:text-text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

export const agentModalLinkClass =
  "text-[13px] text-text-muted transition-colors hover:text-navy";

export const agentModalButtonClass =
  "inline-flex h-10 w-full items-center justify-center rounded-full bg-navy text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const agentModalButtonOutlineClass =
  "inline-flex h-10 w-full items-center justify-center rounded-full border border-stroke bg-surface text-[14px] font-medium text-navy transition-colors hover:bg-bg disabled:opacity-50";

export const agentModalIconButtonClass =
  "rounded-full p-1 text-text-muted transition-colors hover:text-navy disabled:opacity-40";

export const agentModalViewValueClass =
  "rounded-[14px] border border-stroke bg-surface px-4 py-3 text-[14px] leading-relaxed text-navy";

export function agentModalPillClass(active: boolean, compact?: boolean) {
  return cn(
    compact ? "rounded-full px-3 py-1.5 text-[12px]" : "rounded-full px-4 py-2 text-[13px]",
    "font-medium transition-colors",
    active
      ? "bg-navy text-white"
      : "border border-stroke text-text-muted hover:bg-bg hover:text-navy"
  );
}
