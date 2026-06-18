"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  formatTokenCount,
  WELCOME_TOKEN_AMOUNT,
} from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

export function SetupDemoWelcomeModal() {
  const demo = useSetupDemoOptional();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !demo?.showWelcome) return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-demo-welcome-title"
        className="w-full max-w-md rounded border-2 border-[#0E121B] bg-white p-6 shadow-lg"
      >
        <p
          id="setup-demo-welcome-title"
          className="text-[18px] font-normal text-[#0E121B]"
        >
          Willkommen bei Cura
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-[#525866]">
          Sie haben{" "}
          <span className="font-medium text-[#0E121B]">
            {formatTokenCount(WELCOME_TOKEN_AMOUNT)} Tokens
          </span>{" "}
          zum Start erhalten. In der kurzen Demo richten wir gemeinsam Ihren
          Telefonagenten und Ihre erste Nummer ein.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={cn(landingBtnPrimary, "w-full justify-center sm:flex-1")}
            onClick={() => demo.startDemo()}
          >
            Demo starten
          </button>
          <button
            type="button"
            className={cn(landingBtnSecondary, "w-full justify-center sm:flex-1")}
            onClick={() => void demo.skip()}
          >
            Demo überspringen
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
