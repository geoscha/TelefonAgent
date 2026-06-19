"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  landingNavBtnPrimary,
  landingNavBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  userLabelClass,
  userStatClass,
} from "@/components/user/user-styles";
import { formatTokenCount, WELCOME_TOKEN_AMOUNT } from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

export function SetupDemoWelcomeModal() {
  const demo = useSetupDemoOptional();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !demo?.showWelcome) return null;

  return createPortal(
    <div className="user-app fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Schliessen"
        className="absolute inset-0 bg-[#050f1f]/55 backdrop-blur-[4px]"
        onClick={() => void demo.skip()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-demo-welcome-title"
        className="relative w-full max-w-[480px] overflow-hidden rounded border border-[#E1E4EA] bg-white shadow-[0_24px_80px_rgba(5,15,31,0.28)]"
      >
        <div className="bg-[#050f1f] px-6 py-10 sm:px-8 sm:py-12">
          <p
            id="setup-demo-welcome-title"
            className="font-retell-display text-[clamp(56px,13vw,88px)] font-medium leading-[0.9] tracking-[-0.03em] text-white"
          >
            Cura
          </p>

          <div className="mt-8 border-t border-white/10 pt-8">
            <p className={cn(userStatClass, "text-white")}>
              {formatTokenCount(WELCOME_TOKEN_AMOUNT)}
            </p>
            <p className={cn(userLabelClass, "mt-2 text-white/60")}>
              Tokens als Willkommensgeschenk
            </p>
          </div>
        </div>

        <div className="border-t border-[#E1E4EA] bg-white px-6 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-1.5">
            <button
              type="button"
              className={cn(landingNavBtnSecondary, "w-full justify-center sm:w-auto")}
              onClick={() => void demo.skip()}
            >
              Demo überspringen
            </button>
            <button
              type="button"
              className={cn(landingNavBtnPrimary, "w-full justify-center sm:w-auto")}
              onClick={() => demo.startDemo()}
            >
              Demo starten
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
