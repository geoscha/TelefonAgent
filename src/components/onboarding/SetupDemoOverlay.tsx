"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import {
  highlightRectsEqual,
  measureDemoHighlight,
  placeDemoTooltip,
  type DemoHighlightRect,
  type DemoTooltipPlacement,
} from "@/lib/setup-demo-overlay-geometry";
import { getGuideStepById, getGuideStepIdForElement } from "@/lib/setup-demo-steps";
import { cn } from "@/lib/utils";

function readTextFieldValue(container: Element): string {
  if (
    container instanceof HTMLInputElement ||
    container instanceof HTMLTextAreaElement
  ) {
    return container.value;
  }
  const inner = container.querySelector("input, textarea");
  if (
    inner instanceof HTMLInputElement ||
    inner instanceof HTMLTextAreaElement
  ) {
    return inner.value;
  }
  return "";
}

function isTargetActionReady(el: Element): boolean {
  if (el instanceof HTMLButtonElement) {
    return !el.disabled;
  }

  const buttons = el.querySelectorAll("button");
  if (buttons.length === 1) {
    return !(buttons[0] as HTMLButtonElement).disabled;
  }

  if (buttons.length > 1) {
    return Array.from(buttons).some((btn) => {
      const button = btn as HTMLButtonElement;
      if (button.disabled) return false;
      return (
        button.getAttribute("aria-pressed") === "true" ||
        button.className.includes("bg-[#050f1f]") ||
        button.className.includes("text-white")
      );
    });
  }

  return true;
}

/** Sync wizard UI when demo Weiter / Enter is used on optional website step. */
function submitWizardFormForTarget(target: string): boolean {
  const el = document.querySelector(`[data-setup-demo="${target}"]`);
  const form = el?.closest("form");
  if (form instanceof HTMLFormElement) {
    form.requestSubmit();
    return true;
  }
  return false;
}

export function SetupDemoOverlay() {
  const demo = useSetupDemoOptional();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [highlight, setHighlight] = useState<DemoHighlightRect | null>(null);
  const [tooltipPlacement, setTooltipPlacement] =
    useState<DemoTooltipPlacement | null>(null);
  const [fieldFilled, setFieldFilled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const guideStep = demo?.subStepId
    ? getGuideStepById(demo.subStepId)
    : undefined;

  const [targetReady, setTargetReady] = useState(false);

  const weiterEnabled =
    guideStep?.dismissOnly ||
    guideStep?.textInputOptional ||
    (guideStep?.textInput && fieldFilled) ||
    (!guideStep?.textInput &&
      !guideStep?.textInputOptional &&
      !guideStep?.dismissOnly &&
      targetReady);

  const showWeiter = true;
  const showSkip = !guideStep?.dismissOnly;
  const skipLabel = "Demo abbrechen";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!guideStep || guideStep.hidden || guideStep.dismissOnly) {
      setHighlight(null);
      return;
    }

    const target = guideStep.target;
    let scrolled = false;
    let observedEl: Element | null = null;

    function measure() {
      const el = document.querySelector(`[data-setup-demo="${target}"]`);
      if (!el) return;

      const next = measureDemoHighlight(el);
      if (!next) return;

      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }

      setHighlight((prev) =>
        highlightRectsEqual(prev, next) ? prev : next
      );
    }

    function attachObserver() {
      const el = document.querySelector(`[data-setup-demo="${target}"]`);
      if (!el || el === observedEl) return;
      observedEl = el;
      measure();
    }

    measure();
    attachObserver();

    const interval = window.setInterval(attachObserver, 400);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;

    if (resizeObserver) {
      const el = document.querySelector(`[data-setup-demo="${target}"]`);
      if (el) resizeObserver.observe(el);
      const pollAttach = window.setInterval(() => {
        const current = document.querySelector(`[data-setup-demo="${target}"]`);
        if (current && current !== observedEl) {
          observedEl = current;
          resizeObserver.disconnect();
          resizeObserver.observe(current);
          measure();
        }
      }, 400);
      window.addEventListener("resize", measure);
      window.addEventListener("scroll", measure, true);
      return () => {
        window.clearInterval(interval);
        window.clearInterval(pollAttach);
        resizeObserver.disconnect();
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", measure, true);
      };
    }

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [guideStep]);

  useLayoutEffect(() => {
    if (!highlight || !panelRef.current) {
      setTooltipPlacement(null);
      return;
    }
    const panelHeight = panelRef.current.offsetHeight;
    const panelWidth = panelRef.current.offsetWidth;
    setTooltipPlacement(
      placeDemoTooltip(highlight, panelHeight, panelWidth)
    );
  }, [highlight, guideStep?.title, guideStep?.body, showWeiter, weiterEnabled]);

  useEffect(() => {
    if (!guideStep?.textInput && !guideStep?.textInputOptional) {
      setFieldFilled(false);
      return;
    }

    const step = guideStep;
    let targetEl: Element | null = null;

    function sync() {
      if (!targetEl) return;
      if (step.textInputOptional) {
        setFieldFilled(true);
        return;
      }
      setFieldFilled(readTextFieldValue(targetEl).trim().length > 0);
    }

    function attach() {
      if (targetEl) return;
      const found = document.querySelector(`[data-setup-demo="${step.target}"]`);
      if (!found) return;
      targetEl = found;
      sync();
      targetEl.addEventListener("input", sync);
    }

    attach();
    const interval = window.setInterval(attach, 250);

    return () => {
      window.clearInterval(interval);
      if (targetEl) targetEl.removeEventListener("input", sync);
    };
  }, [guideStep]);

  useEffect(() => {
    if (
      !guideStep ||
      guideStep.hidden ||
      guideStep.textInput ||
      guideStep.textInputOptional
    ) {
      setTargetReady(false);
      return;
    }

    const target = guideStep.target;
    let targetEl: Element | null = null;

    function sync() {
      if (!targetEl) return;
      setTargetReady(isTargetActionReady(targetEl));
    }

    function attach() {
      const found = document.querySelector(`[data-setup-demo="${target}"]`);
      if (!found) return;
      if (targetEl !== found) {
        if (targetEl) targetEl.removeEventListener("click", sync);
        targetEl = found;
        targetEl.addEventListener("click", sync);
      }
      sync();
    }

    attach();
    const interval = window.setInterval(attach, 250);

    return () => {
      window.clearInterval(interval);
      if (targetEl) targetEl.removeEventListener("click", sync);
    };
  }, [guideStep]);

  useEffect(() => {
    if (!demo?.active || demo.loading || !demo.step) return;

    const phase = demo.step;
    const activeDemo = demo;

    function syncToTarget(e: Event) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-setup-demo-overlay]")) return;

      const stepId = getGuideStepIdForElement(target, phase);
      if (!stepId || stepId === activeDemo.subStepId) return;

      activeDemo.goToSubStep(stepId);
    }

    document.addEventListener("click", syncToTarget, true);
    document.addEventListener("focusin", syncToTarget, true);

    return () => {
      document.removeEventListener("click", syncToTarget, true);
      document.removeEventListener("focusin", syncToTarget, true);
    };
  }, [demo]);

  useEffect(() => {
    if (!demo?.active || !guideStep?.advanceOnClick) return;

    const activeDemo = demo;
    const advance = activeDemo.advance;
    const target = guideStep.target;
    const stepId = guideStep.id;
    let el: Element | null = null;

    function onClick() {
      if (activeDemo.subStepId === stepId) advance();
    }

    function attach() {
      if (el) return;
      const found = document.querySelector(`[data-setup-demo="${target}"]`);
      if (!found) return;
      el = found;
      el.addEventListener("click", onClick);
    }

    attach();
    const interval = window.setInterval(attach, 250);

    return () => {
      window.clearInterval(interval);
      if (el) el.removeEventListener("click", onClick);
    };
  }, [demo, guideStep]);

  const handleWeiter = useCallback(() => {
    if (!guideStep || !demo?.active) return;

    if (guideStep.dismissOnly) {
      void demo.completePhoneStep();
      return;
    }

    const el = document.querySelector(
      `[data-setup-demo="${guideStep.target}"]`
    );

    if (guideStep.textInput || guideStep.textInputOptional) {
      if (guideStep.textInput && !weiterEnabled) return;
      if (submitWizardFormForTarget(guideStep.target)) return;
      demo.advance();
      return;
    }

    if (!weiterEnabled) return;

    if (submitWizardFormForTarget(guideStep.target)) return;

    if (!el) {
      demo.advance();
      return;
    }

    if (el instanceof HTMLButtonElement) {
      el.click();
      return;
    }

    const buttons = el.querySelectorAll("button");
    if (buttons.length > 1) {
      demo.advance();
      return;
    }

    const single = buttons[0];
    if (single instanceof HTMLButtonElement && !single.disabled) {
      single.click();
      return;
    }

    demo.advance();
  }, [weiterEnabled, guideStep, demo]);

  useEffect(() => {
    if (
      !mounted ||
      !demo?.active ||
      !guideStep ||
      guideStep.hidden ||
      demo.loading
    ) {
      return;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.isComposing) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!weiterEnabled) return;
      e.preventDefault();
      handleWeiter();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    mounted,
    demo?.active,
    demo?.loading,
    guideStep,
    weiterEnabled,
    handleWeiter,
  ]);

  if (
    !mounted ||
    !demo?.active ||
    !demo.demoStarted ||
    !guideStep ||
    guideStep.hidden ||
    demo.loading ||
    (guideStep.phase === "phone" && pathname !== "/phones")
  ) {
    return null;
  }

  const panelStyle =
    guideStep.dismissOnly || !highlight
      ? {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: Math.min(360, window.innerWidth - 32),
        }
      : tooltipPlacement
    ? {
        top: tooltipPlacement.top,
        left: tooltipPlacement.left,
        width: tooltipPlacement.width,
        visibility: "visible" as const,
      }
    : highlight
      ? {
          top: Math.min(highlight.top + highlight.height + 12, window.innerHeight - 180),
          left: Math.max(16, Math.min(highlight.left, window.innerWidth - 316)),
          width: 300,
          visibility: "hidden" as const,
        }
      : {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300,
        };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {guideStep.dismissOnly ? (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(14,18,27,0.42)]" />
      ) : (
        highlight && (
          <div
            className="pointer-events-none absolute border-2 border-[#0E121B]"
            style={{
              top: highlight.top,
              left: highlight.left,
              width: highlight.width,
              height: highlight.height,
              borderRadius: highlight.radius,
              boxShadow: "0 0 0 9999px rgba(14, 18, 27, 0.42)",
            }}
          />
        )
      )}

      <div
        ref={panelRef}
        data-setup-demo-overlay
        className="pointer-events-auto absolute rounded-lg border-2 border-[#0E121B] bg-white p-3.5 shadow-[0_12px_40px_rgba(14,18,27,0.14)]"
        style={panelStyle}
      >
        <p className="text-[13px] font-semibold leading-snug text-[#0E121B]">
          {guideStep.title}
        </p>
        <p className="mt-1.5 break-words text-[12px] leading-relaxed text-[#525866]">
          {guideStep.body}
        </p>
        <div className="mt-3 flex gap-2">
          {showWeiter && (
            <button
              type="button"
              disabled={!weiterEnabled}
              className={cn(
                "landing-caption landing-radius-sm inline-flex min-h-9 flex-1 items-center justify-center px-3 text-[12px] transition-colors",
                weiterEnabled
                  ? landingBtnPrimary
                  : "cursor-not-allowed bg-black/10 text-[#99A0AE]",
                guideStep.dismissOnly && "w-full"
              )}
              onClick={handleWeiter}
            >
              Weiter
            </button>
          )}
          {showSkip && (
            <button
              type="button"
              className={cn(landingBtnSecondary, "flex-1 text-[12px]")}
              onClick={() => void demo.skip()}
            >
              {skipLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
