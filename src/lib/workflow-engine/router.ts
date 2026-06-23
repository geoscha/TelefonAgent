import "server-only";

import {
  getTenantWorkflowOverrides,
  listGovernanceWorkflows,
} from "@/lib/governance/store";
import type { MessageInquiryCategory } from "@/lib/messages/inquiry-types";
import { RECHTSAUSKUNFT_ESCALATION_KEYWORDS } from "@/lib/workflow-engine/defaults";
import {
  ensureWorkflowDefinitions,
  getPublishedWorkflowDefinition,
  listWorkflowDefinitions,
} from "@/lib/workflow-engine/store";
import { routerConfidenceFromScore } from "@/lib/workflow-engine/router-scoring";
import type { RouterResult, WorkflowDefinition } from "@/lib/workflow-engine/types";

const FALLBACK_SLUG = "allgemeine-auskunft";

const CATEGORY_SLUG_MAP: Record<MessageInquiryCategory, string | null> = {
  Schadenmeldung: "schadensfall-meldung",
  Notfall: "schadensfall-meldung",
  Allgemein: "allgemeine-auskunft",
  "Vertrag/Miete": null,
  Terminanfrage: null,
  Terminänderung: null,
};

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function scoreWorkflow(
  definition: WorkflowDefinition,
  text: string
): { score: number; reasons: string[] } {
  const normalized = normalizeText(text);
  let score = 0;
  const reasons: string[] = [];

  for (const pattern of definition.triggerPatterns) {
    if (normalized.includes(normalizeText(pattern))) {
      score += 3;
      reasons.push(`pattern:${pattern}`);
    }
  }

  if (definition.slug === "rechtsauskunft") {
    for (const keyword of RECHTSAUSKUNFT_ESCALATION_KEYWORDS) {
      if (normalized.includes(keyword)) {
        score += 4;
        reasons.push(`legal:${keyword}`);
      }
    }
  }

  if (definition.slug === "schadensfall-meldung") {
    if (/schaden|defekt|tropf|heizung|wasser|kaputt|notfall/.test(normalized)) {
      score += 2;
      reasons.push("damage-heuristic");
    }
  }

  return { score, reasons };
}

async function listEnabledDefinitions(
  userId?: string
): Promise<WorkflowDefinition[]> {
  await ensureWorkflowDefinitions();
  const workflows = await listGovernanceWorkflows();
  const overrides = userId ? await getTenantWorkflowOverrides(userId) : {};
  const records = await listWorkflowDefinitions();

  const enabled: WorkflowDefinition[] = [];
  for (const workflow of workflows) {
    const override = overrides[workflow.id];
    const isEnabled =
      override !== undefined ? override : workflow.enabledGlobally;
    if (!isEnabled) continue;

    const record = records.find((r) => r.slug === workflow.slug);
    const published = await getPublishedWorkflowDefinition(workflow.slug);
    if (published) {
      enabled.push(published.definition);
    } else if (record) {
      enabled.push(record.definition);
    }
  }
  return enabled;
}

export async function classifyWorkflowIntent(input: {
  text: string;
  userId?: string;
  category?: MessageInquiryCategory | null;
  llmSlug?: string | null;
}): Promise<RouterResult> {
  const enabled = await listEnabledDefinitions(input.userId);
  const text = input.text.trim();

  if (input.llmSlug) {
    const match = enabled.find((d) => d.slug === input.llmSlug);
    if (match) {
      return {
        slug: match.slug,
        confidence: 0.85,
        reason: "llm-slug",
        workflow: match,
        version: match.version,
      };
    }
  }

  if (input.category) {
    const mapped = CATEGORY_SLUG_MAP[input.category];
    if (mapped) {
      const match = enabled.find((d) => d.slug === mapped);
      if (match) {
        return {
          slug: match.slug,
          confidence: 0.75,
          reason: `category:${input.category}`,
          workflow: match,
          version: match.version,
        };
      }
    }
    if (input.category === "Vertrag/Miete") {
      const legal = enabled.find((d) => d.slug === "rechtsauskunft");
      if (legal && scoreWorkflow(legal, text).score >= 2) {
        return {
          slug: legal.slug,
          confidence: 0.7,
          reason: "category:Vertrag/Miete+legal",
          workflow: legal,
          version: legal.version,
        };
      }
    }
  }

  let best: { definition: WorkflowDefinition; score: number; reasons: string[] } | null =
    null;
  for (const definition of enabled) {
    const { score, reasons } = scoreWorkflow(definition, text);
    if (!best || score > best.score) {
      best = { definition, score, reasons };
    }
  }

  if (best && best.score >= 2) {
    const confidence = routerConfidenceFromScore(best.score);
    return {
      slug: best.definition.slug,
      confidence,
      reason: best.reasons.join(", "),
      workflow: best.definition,
      version: best.definition.version,
    };
  }

  const fallback =
    enabled.find((d) => d.slug === FALLBACK_SLUG) ??
    enabled[0] ??
    null;

  if (fallback) {
    return {
      slug: fallback.slug,
      confidence: 0.4,
      reason: "fallback",
      workflow: fallback,
      version: fallback.version,
    };
  }

  return {
    slug: FALLBACK_SLUG,
    confidence: 0,
    reason: "no-workflows-enabled",
  };
}

export async function resolveActiveWorkflow(input: {
  text: string;
  userId?: string;
  category?: MessageInquiryCategory | null;
  llmSlug?: string | null;
}): Promise<RouterResult> {
  return classifyWorkflowIntent(input);
}
