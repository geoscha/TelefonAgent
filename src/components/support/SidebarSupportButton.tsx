"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";

import { SupportChatPanel } from "@/components/support/SupportChatPanel";
import { landingBtnSecondary } from "@/components/landing/landing-buttons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function SidebarSupportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(landingBtnSecondary, "w-full justify-center bg-white")}
      >
        Support
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-[#E1E4EA] bg-white p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-normal text-[#0E121B]">
              Support
            </DialogTitle>
          </DialogHeader>
          <SupportChatPanel active={open} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SidebarSupportIcon() {
  return <LifeBuoy className="h-7 w-7 stroke-[1.25]" />;
}
