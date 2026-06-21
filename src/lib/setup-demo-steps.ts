export type SetupDemoPhase = "agent" | "phone";

export interface SetupDemoGuideStep {
  id: string;
  phase: SetupDemoPhase;
  target: string;
  title: string;
  body: string;
  /** Advance when the highlighted element is clicked. */
  advanceOnClick?: boolean;
  /** Hide overlay while this step is active (e.g. during AI generation). */
  hidden?: boolean;
  /** Text field step — show demo-panel "Weiter" when filled. */
  textInput?: boolean;
  /** Optional text field — demo-panel "Weiter" always available. */
  textInputOptional?: boolean;
  /** Centered panel only — no spotlight; Weiter ends the step. */
  dismissOnly?: boolean;
}

export const SETUP_DEMO_GUIDE: SetupDemoGuideStep[] = [
  {
    id: "agent_create",
    phase: "agent",
    target: "setup-demo-agent-create",
    title: "Schritt 1 · Agent starten",
    body: "Klicken Sie hier, um Ihren ersten KI-Telefonagenten anzulegen.",
    advanceOnClick: true,
  },
  {
    id: "agent_website",
    phase: "agent",
    target: "setup-demo-agent-website",
    title: "Website der Verwaltung (optional)",
    body: "Tragen Sie optional die Website Ihrer Immobilienverwaltung ein und klicken Sie auf Weiter — oder überspringen Sie den Schritt.",
    textInputOptional: true,
  },
  {
    id: "agent_ziel",
    phase: "agent",
    target: "setup-demo-agent-ziel",
    title: "Ziel des Agenten",
    body: "Beschreiben Sie, wofür der Agent eingesetzt wird — z. B. Termine vereinbaren.",
    textInput: true,
  },
  {
    id: "agent_language",
    phase: "agent",
    target: "setup-demo-agent-language",
    title: "Sprache",
    body: "Wählen Sie Deutsch oder Schweizerdeutsch für den Agenten.",
  },
  {
    id: "agent_language_create",
    phase: "agent",
    target: "setup-demo-agent-language-create",
    title: "Agent erstellen",
    body: "Klicken Sie hier — der Agent wird anhand Ihrer Angaben vorbereitet.",
  },
  {
    id: "agent_generating",
    phase: "agent",
    target: "setup-demo-agent-generating",
    title: "Agent wird erstellt…",
    body: "Einen Moment — Ihr Agent wird gerade vorbereitet.",
    hidden: true,
  },
  {
    id: "agent_review_name",
    phase: "agent",
    target: "setup-demo-agent-review-name",
    title: "Name prüfen",
    body: "Passen Sie den Namen Ihres Agenten an, falls nötig.",
    textInput: true,
  },
  {
    id: "agent_review_voice",
    phase: "agent",
    target: "setup-demo-agent-review-voice",
    title: "Stimme wählen",
    body: "Wählen Sie eine Stimme — weiblich oder männlich.",
  },
  {
    id: "agent_review_greeting",
    phase: "agent",
    target: "setup-demo-agent-review-greeting",
    title: "Begrüssung",
    body: "Passen Sie die Begrüssung an und klicken Sie auf «Assistent speichern».",
    textInput: true,
  },
  {
    id: "phone_intro",
    phase: "phone",
    target: "setup-demo-phone-intro",
    title: "Schritt 2 · Telefonnummer",
    body: "Um Anrufe an Ihren KI-Agenten weiterzuleiten, benötigen Sie eine Telefonnummer. Beantragen Sie hier eine Nummer und weisen Sie sie Ihrem Agenten zu — der Rest liegt bei Ihnen.",
    dismissOnly: true,
  },
];

export function getGuideStepsForPhase(phase: SetupDemoPhase): SetupDemoGuideStep[] {
  return SETUP_DEMO_GUIDE.filter((s) => s.phase === phase);
}

export function getGuideStepById(id: string): SetupDemoGuideStep | undefined {
  return SETUP_DEMO_GUIDE.find((s) => s.id === id);
}

export function getGuideStepByTarget(
  target: string
): SetupDemoGuideStep | undefined {
  return SETUP_DEMO_GUIDE.find((s) => s.target === target);
}

/** Resolve demo step from a clicked/focused element. */
export function getGuideStepIdForElement(
  el: Element | null,
  phase: SetupDemoPhase | null
): string | null {
  if (!el || !phase) return null;
  const host = el.closest("[data-setup-demo]");
  if (!host) return null;
  const target = host.getAttribute("data-setup-demo");
  if (!target) return null;
  const step = getGuideStepByTarget(target);
  if (!step || step.hidden || step.phase !== phase) return null;
  return step.id;
}

export function getInitialSubStepId(phase: SetupDemoPhase): string {
  return getGuideStepsForPhase(phase)[0]?.id ?? "";
}

export function getNextSubStepId(
  phase: SetupDemoPhase,
  currentId: string
): string | null {
  const steps = getGuideStepsForPhase(phase);
  const idx = steps.findIndex((s) => s.id === currentId);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1].id;
}
