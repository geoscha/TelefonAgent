"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  landingNavBtnPrimary,
  landingNavBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { formatTokenCount, WELCOME_TOKEN_AMOUNT } from "@/lib/billing/quota-display";
import { cn } from "@/lib/utils";

export function SetupDemoWelcomeModal() {
  const demo = useSetupDemoOptional();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !demo?.showWelcome) return null;

  return createPortal(
    <div className="retell-landing fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Schliessen"
        className="absolute inset-0 bg-[#050f1f]/45 backdrop-blur-[6px]"
        onClick={() => void demo.skip()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-demo-welcome-title"
        className="relative w-full max-w-[500px] overflow-hidden landing-radius shadow-[0_28px_90px_rgba(5,15,31,0.32)]"
      >
        <div className="landing-gradient relative overflow-hidden px-6 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-10">
          <div
            className="welcome-gradient-overlay pointer-events-none absolute inset-0 opacity-90"
            aria-hidden
          />

          <div className="relative flex flex-col justify-center">
            <p
              id="setup-demo-welcome-title"
              className="font-retell-display text-[clamp(44px,10vw,60px)] font-medium leading-[0.92] tracking-[-0.03em] text-white"
            >
              {formatTokenCount(WELCOME_TOKEN_AMOUNT)}
            </p>
            <p className="landing-hero-body mt-1.5 text-[15px] text-white/80 sm:text-base">
              Tokens für Sie
            </p>
          </div>
        </div>

        <div className="landing-nav-glass relative z-10 -mt-5 px-6 py-4 sm:px-8 sm:py-5">
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
