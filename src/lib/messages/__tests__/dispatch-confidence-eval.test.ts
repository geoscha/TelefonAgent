import { describe, expect, it } from "vitest";

import {
  DISPATCH_CONFIDENCE_FLOOR,
  effectiveDispatchWorkflowSlug,
  isWorkflowDispatchAllowed,
  NON_DISPATCH_WORKFLOW_SLUG,
} from "@/lib/messages/inquiry-workflow-engine";
import {
  DISPATCH_CONFIDENCE_EVAL,
  ROUTER_FALLBACK_CONFIDENCE,
  ROUTER_MIN_PATTERN_SCORE,
  routerConfidenceFromScore,
} from "@/lib/workflow-engine/router-scoring";

describe("DISPATCH_CONFIDENCE_FLOOR calibration", () => {
  it("floor sits between fallback and minimum pattern-match confidence", () => {
    expect(DISPATCH_CONFIDENCE_FLOOR).toBeGreaterThan(ROUTER_FALLBACK_CONFIDENCE);
    expect(DISPATCH_CONFIDENCE_FLOOR).toBeLessThan(
      routerConfidenceFromScore(ROUTER_MIN_PATTERN_SCORE)
    );
  });

  it.each(DISPATCH_CONFIDENCE_EVAL.map((c) => [c.name, c] as const))(
    "%s",
    (_name, evalCase) => {
      const allowed = isWorkflowDispatchAllowed(
        evalCase.slug,
        evalCase.routerConfidence
      );
      expect(allowed).toBe(evalCase.expectDispatch);

      const effective = effectiveDispatchWorkflowSlug(
        evalCase.slug,
        evalCase.routerConfidence
      );
      if (evalCase.expectDispatch) {
        expect(effective).toBe(evalCase.slug);
      } else if (evalCase.slug !== NON_DISPATCH_WORKFLOW_SLUG) {
        expect(effective).toBe(NON_DISPATCH_WORKFLOW_SLUG);
      } else {
        expect(effective).toBe(NON_DISPATCH_WORKFLOW_SLUG);
      }
    }
  );
});
