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
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import { cn } from "@/lib/utils";

export function SetupDemoWelcomeModal() {
  const demo = useSetupDemoOptional();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !demo?.showWelcome) return null;

  return createPortal(
    <div className="user-app pointer-events-none fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-demo-welcome-title"
        className={cn(
          userPanelClass,
          "pointer-events-auto relative w-full max-w-[440px] p-6 shadow-[0_16px_48px_rgba(5,15,31,0.12)]"
        )}
      >
        <p id="setup-demo-welcome-title" className={userTitleClass}>
          Willkommen bei Cura
        </p>
        <p className={`${userLabelClass} mt-2`}>
          In wenigen Schritten richten Sie Ihren ersten KI-Telefonagenten ein.
          Danach weisen Sie ihm eine Telefonnummer zu.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-1.5">
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
    </div>,
    document.body
  );
}
