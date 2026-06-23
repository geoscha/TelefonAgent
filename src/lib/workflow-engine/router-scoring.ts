/** Pure router scoring helpers — shared by router and eval tests. */

export const ROUTER_FALLBACK_CONFIDENCE = 0.4;
export const ROUTER_MIN_PATTERN_SCORE = 2;

/** Mirrors classifyWorkflowIntent: min(0.95, 0.5 + score * 0.08) for score >= 2. */
export function routerConfidenceFromScore(score: number): number {
  if (score < ROUTER_MIN_PATTERN_SCORE) return ROUTER_FALLBACK_CONFIDENCE;
  return Math.min(0.95, 0.5 + score * 0.08);
}

export interface DispatchConfidenceEvalCase {
  name: string;
  slug: string;
  routerConfidence: number;
  expectDispatch: boolean;
}

/**
 * Eval set for DISPATCH_CONFIDENCE_FLOOR calibration.
 * Router confidence values reflect classifyWorkflowIntent behaviour (see router.ts).
 */
export const DISPATCH_CONFIDENCE_EVAL: DispatchConfidenceEvalCase[] = [
  {
    name: "klarer Schaden (score 4+)",
    slug: "schadensfall-meldung",
    routerConfidence: routerConfidenceFromScore(4),
    expectDispatch: true,
  },
  {
    name: "Notfall Schaden (score 3+)",
    slug: "schadensfall-meldung",
    routerConfidence: routerConfidenceFromScore(3),
    expectDispatch: true,
  },
  {
    name: "schwacher Pattern-Match (score 2, Minimum)",
    slug: "schadensfall-meldung",
    routerConfidence: routerConfidenceFromScore(2),
    expectDispatch: true,
  },
  {
    name: "Kategorie Schadenmeldung",
    slug: "schadensfall-meldung",
    routerConfidence: 0.75,
    expectDispatch: true,
  },
  {
    name: "Router-Fallback allgemeine-auskunft",
    slug: "allgemeine-auskunft",
    routerConfidence: ROUTER_FALLBACK_CONFIDENCE,
    expectDispatch: false,
  },
  {
    name: "Nebenkosten / allgemeine Auskunft (pattern match)",
    slug: "allgemeine-auskunft",
    routerConfidence: routerConfidenceFromScore(2),
    expectDispatch: false,
  },
  {
    name: "Hypothetischer Low-Confidence Schaden (unter Floor)",
    slug: "schadensfall-meldung",
    routerConfidence: 0.52,
    expectDispatch: false,
  },
];
