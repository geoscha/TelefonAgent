"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  landingBtnPrimary,
  landingBtnSecondary,
} from "@/components/landing/landing-buttons";
import { useSetupDemoOptional } from "@/components/onboarding/SetupDemoProvider";
import { getGuideStepById, getGuideStepIdForElement } from "@/lib/setup-demo-steps";
import { cn } from "@/lib/utils";

function rectsEqual(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

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

/** Sync wizard UI when demo Weiter / Enter is used on text steps. */
function triggerWizardContinue(stepId: string, container: Element | null): boolean {
  if (!container) return false;

  switch (stepId) {
    case "agent_branche": {
      const next = document.querySelector(
        '[data-setup-demo="setup-demo-agent-branche-next"]'
      );
      if (next instanceof HTMLButtonElement && !next.disabled) {
        next.click();
        return true;
      }
      return false;
    }
    case "agent_website": {
      const input = container.querySelector("input");
      const hasWebsite =
        input instanceof HTMLInputElement && input.value.trim().length > 0;
      const buttons = container.querySelectorAll("button");
      const weiter = buttons[0];
      const skip = buttons[1];
      if (hasWebsite && weiter instanceof HTMLButtonElement) {
        weiter.click();
        return true;
      }
      if (skip instanceof HTMLButtonElement) {
        skip.click();
        return true;
      }
      return false;
    }
    case "agent_ziel": {
      const next = document.querySelector(
        '[data-setup-demo="setup-demo-agent-ziel-next"]'
      );
      if (next instanceof HTMLButtonElement && !next.disabled) {
        next.click();
        return true;
      }
      return false;
    }
    case "agent_review_name":
    case "agent_review_greeting":
      return false;
    default:
      return false;
  }
}

export function SetupDemoOverlay() {
  const demo = useSetupDemoOptional();
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [fieldFilled, setFieldFilled] = useState(false);

  const guideStep = demo?.subStepId
    ? getGuideStepById(demo.subStepId)
    : undefined;

  const [targetReady, setTargetReady] = useState(false);

  const weiterEnabled =
    guideStep?.textInputOptional ||
    (guideStep?.textInput && fieldFilled) ||
    (!guideStep?.textInput &&
      !guideStep?.textInputOptional &&
      targetReady);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!guideStep || guideStep.hidden) {
      setRect(null);
      return;
    }

    const target = guideStep.target;
    let scrolled = false;

    function measure() {
      const el = document.querySelector(`[data-setup-demo="${target}"]`);
      if (!el) return;
      const next = el.getBoundingClientRect();
      if (!scrolled && next.width > 0 && next.height > 0) {
        scrolled = true;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
      setRect((prev) => {
        if (prev && rectsEqual(prev, next)) return prev;
        return next;
      });
    }

    measure();
    const interval = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [guideStep]);

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
    if (!weiterEnabled || !guideStep || !demo?.active) return;

    const el = document.querySelector(
      `[data-setup-demo="${guideStep.target}"]`
    );

    if (guideStep.textInput || guideStep.textInputOptional) {
      if (triggerWizardContinue(guideStep.id, el)) return;
      demo.advance();
      return;
    }

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
    !guideStep ||
    guideStep.hidden ||
    demo.loading
  ) {
    return null;
  }

  const pad = 6;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]">
      <div className="pointer-events-none absolute inset-0 bg-black/20" />

      {rect && (
        <div
          className="pointer-events-none absolute rounded border-2 border-[#0E121B] bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}

      <div
        data-setup-demo-overlay
        className="pointer-events-auto absolute max-w-[320px] rounded border-2 border-[#0E121B] bg-white p-3 shadow-lg"
        style={
          rect
            ? {
                top: Math.min(rect.bottom + 12, window.innerHeight - 160),
                left: Math.min(
                  Math.max(16, rect.left),
                  window.innerWidth - 336
                ),
              }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <p className="text-[12px] font-medium text-[#0E121B]">
          {guideStep.title}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#525866]">
          {guideStep.body}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!weiterEnabled}
            className={cn(
              "landing-caption landing-radius-sm inline-flex min-h-9 flex-1 items-center justify-center px-3 text-[12px] transition-colors",
              weiterEnabled
                ? landingBtnPrimary
                : "cursor-not-allowed bg-black/10 text-[#99A0AE]"
            )}
            onClick={handleWeiter}
          >
            Weiter
          </button>
          <button
            type="button"
            className={cn(landingBtnSecondary, "flex-1 text-[12px]")}
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
