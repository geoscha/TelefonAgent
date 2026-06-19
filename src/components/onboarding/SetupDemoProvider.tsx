"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  getGuideStepById,
  getInitialSubStepId,
  getNextSubStepId,
  type SetupDemoPhase,
} from "@/lib/setup-demo-steps";
import { dispatchSetupDemoSkipped } from "@/lib/setup-demo-events";
import type { SetupDemoStep } from "@/lib/setup-demo";

const DEMO_STARTED_KEY = "cura-setup-demo-started";

interface SetupDemoContextValue {
  active: boolean;
  step: SetupDemoStep | null;
  subStepId: string | null;
  subStepReady: boolean;
  loading: boolean;
  demoStarted: boolean;
  showWelcome: boolean;
  skip: () => Promise<void>;
  startDemo: () => void;
  advance: () => void;
  goToSubStep: (subStepId: string) => void;
  setSubStepReady: (ready: boolean) => void;
  completeAgentStep: () => Promise<void>;
  completePhoneStep: () => Promise<void>;
  restart: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SetupDemoContext = createContext<SetupDemoContextValue | null>(null);

export function useSetupDemo() {
  const ctx = useContext(SetupDemoContext);
  if (!ctx) {
    throw new Error("useSetupDemo must be used within SetupDemoProvider");
  }
  return ctx;
}

export function useSetupDemoOptional() {
  return useContext(SetupDemoContext);
}

export function SetupDemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState<SetupDemoStep | null>(null);
  const [subStepId, setSubStepId] = useState<string | null>(null);
  const [subStepReady, setSubStepReady] = useState(false);
  const [demoStarted, setDemoStarted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDemoStarted(sessionStorage.getItem(DEMO_STARTED_KEY) === "1");
  }, []);

  const applyPayload = useCallback(
    (data: {
      active?: boolean;
      step?: SetupDemoStep | null;
      subStepId?: string | null;
    }) => {
      setActive(Boolean(data.active));
      const nextStep = data.step ?? null;
      setStep(nextStep);
      if (nextStep === "agent" || nextStep === "phone") {
        setSubStepId(
          data.subStepId ?? getInitialSubStepId(nextStep as SetupDemoPhase)
        );
      } else {
        setSubStepId(null);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/setup-demo");
      const data = await res.json();
      if (res.ok && data.ok) {
        applyPayload(data);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goToSubStep = useCallback((id: string) => {
    if (!getGuideStepById(id)) return;
    setSubStepId(id);
    setSubStepReady(false);
  }, []);

  useEffect(() => {
    if (!active || step !== "agent") return;
    if (pathname !== "/telefonagent") {
      router.push("/telefonagent");
    }
  }, [active, step, pathname, router]);

  const advance = useCallback(() => {
    if (!step || (step !== "agent" && step !== "phone") || !subStepId) return;
    const next = getNextSubStepId(step, subStepId);
    if (next) {
      setSubStepId(next);
      setSubStepReady(false);
    }
  }, [step, subStepId]);

  const skip = useCallback(async () => {
    const res = await fetch("/api/setup-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      applyPayload(data);
      sessionStorage.removeItem(DEMO_STARTED_KEY);
      setDemoStarted(false);
      dispatchSetupDemoSkipped(true);
    }
  }, [applyPayload]);

  const startDemo = useCallback(() => {
    sessionStorage.setItem(DEMO_STARTED_KEY, "1");
    setDemoStarted(true);
    router.push("/telefonagent");
  }, [router]);

  const completeAgentStep = useCallback(async () => {
    const res = await fetch("/api/setup-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete_agent" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      applyPayload({
        ...data,
        subStepId: getInitialSubStepId("phone"),
      });
      router.push("/phones");
    }
  }, [applyPayload, router]);

  const completePhoneStep = useCallback(async () => {
    const res = await fetch("/api/setup-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete_phone" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      applyPayload(data);
      sessionStorage.removeItem(DEMO_STARTED_KEY);
      setDemoStarted(false);
    }
  }, [applyPayload]);

  const restart = useCallback(async () => {
    const res = await fetch("/api/setup-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart" }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      applyPayload({
        ...data,
        subStepId: getInitialSubStepId("agent"),
      });
      sessionStorage.setItem(DEMO_STARTED_KEY, "1");
      setDemoStarted(true);
      router.push("/telefonagent");
    }
  }, [applyPayload, router]);

  const showWelcome =
    active && step === "agent" && !demoStarted && !loading;

  const value = useMemo(
    () => ({
      active,
      step,
      subStepId,
      subStepReady,
      loading,
      demoStarted,
      showWelcome,
      skip,
      startDemo,
      advance,
      goToSubStep,
      setSubStepReady,
      completeAgentStep,
      completePhoneStep,
      restart,
      refresh,
    }),
    [
      active,
      step,
      subStepId,
      subStepReady,
      loading,
      demoStarted,
      showWelcome,
      skip,
      startDemo,
      advance,
      goToSubStep,
      completeAgentStep,
      completePhoneStep,
      restart,
      refresh,
    ]
  );

  return (
    <SetupDemoContext.Provider value={value}>
      {children}
    </SetupDemoContext.Provider>
  );
}
