import "server-only";

import { classifyWorkflowIntent } from "@/lib/workflow-engine/router";
import { validateWorkflowSlots } from "@/lib/workflow-engine/slot-validator";
import {
  getPublishedWorkflowDefinition,
  listWorkflowTestCases,
} from "@/lib/workflow-engine/store";
import type { WorkflowTestCase } from "@/lib/workflow-engine/types";

export interface WorkflowTestRunResult {
  testCaseId: string;
  name: string;
  passed: boolean;
  errors: string[];
}

export async function runWorkflowTestCases(
  definitionId: string
): Promise<WorkflowTestRunResult[]> {
  const testCases = await listWorkflowTestCases(definitionId);
  const results: WorkflowTestRunResult[] = [];

  for (const testCase of testCases) {
    results.push(await runSingleTestCase(testCase));
  }

  return results;
}

async function runSingleTestCase(
  testCase: WorkflowTestCase
): Promise<WorkflowTestRunResult> {
  const errors: string[] = [];
  const router = await classifyWorkflowIntent({
    text: testCase.inputText,
    category: null,
  });

  if (testCase.expectedSlug && router.slug !== testCase.expectedSlug) {
    errors.push(
      `Router: erwartet ${testCase.expectedSlug}, erhalten ${router.slug}`
    );
  }

  if (testCase.expectedSlug) {
    const published = await getPublishedWorkflowDefinition(testCase.expectedSlug);
    if (published) {
      const validation = validateWorkflowSlots(
        published.definition,
        testCase.expectedSlots
      );
      if (!validation.valid && Object.keys(testCase.expectedSlots).length > 0) {
        errors.push(
          `Slots: fehlend ${validation.missing.join(", ")}`
        );
      }
    }
  }

  if (testCase.mustEscalate && testCase.expectedSlug === "rechtsauskunft") {
    const lower = testCase.inputText.toLowerCase();
    const legalHit = /klage|anwalt|schadenersatz|kündigung|rechtsstreit/.test(lower);
    if (!legalHit) {
      errors.push("Eskalations-Heuristik: kein Legal-Keyword gefunden");
    }
  }

  for (const forbidden of testCase.forbiddenOutputs) {
    if (testCase.inputText.toLowerCase().includes(forbidden.toLowerCase())) {
      continue;
    }
  }

  return {
    testCaseId: testCase.id,
    name: testCase.name,
    passed: errors.length === 0,
    errors,
  };
}

export async function canPublishWorkflowDefinition(
  definitionId: string
): Promise<{ ok: boolean; errors: string[] }> {
  const results = await runWorkflowTestCases(definitionId);
  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: failures.flatMap((f) =>
      f.errors.map((e) => `${f.name}: ${e}`)
    ),
  };
}
