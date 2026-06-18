"use client";

import { Toaster } from "sonner";

/**
 * Brand-styled toaster. Uses Cura tokens via CSS vars so success/error/info
 * toasts read as part of the product, not default sonner chrome.
 */
export function BrandToaster() {
  return (
    <Toaster
      position="bottom-right"
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-card !border !border-stroke !bg-surface !text-text !font-sans !shadow-[0_4px_20px_rgba(20,36,46,0.08)]",
          title: "!text-[14px] !font-medium !text-text",
          description: "!text-caption !text-text-muted",
          actionButton:
            "!rounded-btn !bg-accent !text-white !text-[13px] !font-medium",
          cancelButton:
            "!rounded-btn !border !border-stroke !bg-surface !text-text !text-[13px]",
          icon: "!text-accent",
        },
      }}
    />
  );
}
