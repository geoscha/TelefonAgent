import "server-only";

import type { GovernanceWorkflow } from "@/lib/governance/types";
import {
  getTenantWorkflowOverrides,
  listGovernanceWorkflows,
} from "@/lib/governance/store";
import type {
  MessageInquiryCategory,
  MessageInquiryUrgency,
} from "@/lib/messages/inquiry-types";
import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import { classifyWorkflowIntent } from "@/lib/workflow-engine/router";

export interface MatchedInquiryWorkflow {
  slug: string;
  name: string;
  description?: string;
}

const CATEGORY_WORKFLOW_SLUG: Partial<
  Record<MessageInquiryCategory, string>
> = {
  Schadenmeldung: "schadensfall-meldung",
  Notfall: "schadensfall-meldung",
  Allgemein: "allgemeine-auskunft",
  "Vertrag/Miete": "rechtsauskunft",
};

const TEXT_WORKFLOW_HINTS: Array<{ pattern: RegExp; slug: string }> = [
  {
    pattern:
      /schaden|defekt|kaputt|undicht|wasser|tropf|leck|rohrbruch|heizung|schimmel|notfall|gas|feuer|brand/i,
    slug: "schadensfall-meldung",
  },
  {
    pattern:
      /recht|kündigung|kündigen|klage|anwalt|gericht|schadenersatz|mietrecht|rechtsstreit/i,
    slug: "rechtsauskunft",
  },
  {
    pattern:
      /öffnungszeit|information|auskunft|frage|kontakt|hausordnung|nebenkosten|miete|mietzins|vertrag|website|leistung|preis|kosten|adresse|email|telefon|faq/i,
    slug: "allgemeine-auskunft",
  },
];

export async function listEnabledGovernanceWorkflows(
  userId?: string
): Promise<GovernanceWorkflow[]> {
  const workflows = await listGovernanceWorkflows();
  if (!userId) {
    return workflows.filter((workflow) => workflow.enabledGlobally);
  }

  const overrides = await getTenantWorkflowOverrides(userId);
  return workflows.filter((workflow) => {
    const override = overrides[workflow.id];
    return override !== undefined ? override : workflow.enabledGlobally;
  });
}

export function matchWorkflowFromCategory(
  category: MessageInquiryCategory | undefined,
  workflows: GovernanceWorkflow[]
): MatchedInquiryWorkflow | undefined {
  const slug = category ? CATEGORY_WORKFLOW_SLUG[category] : undefined;
  if (!slug) return undefined;

  const workflow = workflows.find((entry) => entry.slug === slug);
  if (!workflow) return undefined;

  return {
    slug: workflow.slug,
    name: workflow.name,
    description: workflow.description,
  };
}

export function matchWorkflowFromText(
  text: string,
  workflows: GovernanceWorkflow[]
): MatchedInquiryWorkflow | undefined {
  for (const hint of TEXT_WORKFLOW_HINTS) {
    if (!hint.pattern.test(text)) continue;
    const workflow = workflows.find((entry) => entry.slug === hint.slug);
    if (workflow) {
      return {
        slug: workflow.slug,
        name: workflow.name,
        description: workflow.description,
      };
    }
  }
  return undefined;
}

export async function resolveInquiryWorkflowAsync(input: {
  category?: MessageInquiryCategory;
  urgency?: MessageInquiryUrgency;
  threadText: string;
  workflows: GovernanceWorkflow[];
  llmWorkflowSlug?: string;
  userId?: string;
}): Promise<MatchedInquiryWorkflow | undefined> {
  if (input.userId && (await isWorkflowEngineEnabledForUser(input.userId))) {
    const router = await classifyWorkflowIntent({
      text: input.threadText,
      userId: input.userId,
      category: input.category,
      llmSlug: input.llmWorkflowSlug,
    });
    const workflow = input.workflows.find((w) => w.slug === router.slug);
    if (workflow) {
      return {
        slug: workflow.slug,
        name: workflow.name,
        description: workflow.description,
      };
    }
  }

  return resolveInquiryWorkflow(input);
}

export function resolveInquiryWorkflow(input: {
  category?: MessageInquiryCategory;
  urgency?: MessageInquiryUrgency;
  threadText: string;
  workflows: GovernanceWorkflow[];
  llmWorkflowSlug?: string;
}): MatchedInquiryWorkflow | undefined {
  if (input.llmWorkflowSlug) {
    const fromLlm = input.workflows.find(
      (workflow) => workflow.slug === input.llmWorkflowSlug
    );
    if (fromLlm) {
      return {
        slug: fromLlm.slug,
        name: fromLlm.name,
        description: fromLlm.description,
      };
    }
  }

  const fromCategory = matchWorkflowFromCategory(input.category, input.workflows);
  if (fromCategory) return fromCategory;

  return matchWorkflowFromText(input.threadText, input.workflows);
}

export function categoryLabelForWorkflow(slug: string): string | undefined {
  switch (slug) {
    case "schadensfall-meldung":
      return "Schadenmeldung";
    case "allgemeine-auskunft":
      return "Allgemein";
    case "rechtsauskunft":
      return "Vertrag/Miete";
    default:
      return undefined;
  }
}
