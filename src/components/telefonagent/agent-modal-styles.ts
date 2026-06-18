import { cn } from "@/lib/utils";

export const agentModalPanelClass =
  "relative w-full max-w-[680px] max-h-[90vh] overflow-y-auto rounded border border-[#E1E4EA] bg-white p-7 sm:p-10 shadow-[0_8px_32px_-12px_rgba(20,36,46,0.12)]";

export const agentModalTitleClass =
  "text-[18px] font-normal leading-tight text-[#0E121B]";

export const agentModalLabelClass = "text-[13px] font-normal text-[#525866]";

export const agentModalInputClass =
  "flex h-10 w-full rounded border border-[#E1E4EA] bg-white px-4 text-[14px] font-normal text-[#0E121B] placeholder:text-[#99A0AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#335cff]/20";

export const agentModalTextareaClass =
  "flex min-h-[72px] w-full resize-y rounded border border-[#E1E4EA] bg-white px-4 py-3 text-[14px] font-normal leading-relaxed text-[#0E121B] placeholder:text-[#99A0AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#335cff]/20";

export const agentModalLinkClass =
  "text-[13px] font-normal text-[#525866] transition-colors hover:text-[#0E121B]";

export const agentModalButtonClass =
  "inline-flex h-10 w-full items-center justify-center rounded bg-[#050f1f] text-[14px] font-normal text-white transition-colors hover:bg-[#12233D] disabled:opacity-50";

export const agentModalButtonOutlineClass =
  "inline-flex h-10 w-full items-center justify-center rounded border border-[#E1E4EA] bg-white text-[14px] font-normal text-[#0E121B] transition-colors hover:bg-[#F5F7FA] disabled:opacity-50";

export const agentModalIconButtonClass =
  "rounded p-1 text-[#525866] transition-colors hover:text-[#0E121B] disabled:opacity-40";

export const agentModalViewValueClass =
  "rounded border border-[#E1E4EA] bg-[#F5F7FA] px-4 py-3 text-[14px] font-normal leading-relaxed text-[#0E121B]";

export function agentModalPillClass(active: boolean, compact?: boolean) {
  return cn(
    compact ? "rounded px-3 py-1.5 text-[12px]" : "rounded px-4 py-2 text-[13px]",
    "font-normal transition-colors",
    active
      ? "bg-[#050f1f] text-white"
      : "border border-[#E1E4EA] text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
  );
}
