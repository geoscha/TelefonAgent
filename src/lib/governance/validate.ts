import type {
  GovernanceDraftConfig,
  GovernanceValidationIssue,
  GovernanceWorkflow,
  GovernanceWorkflowInput,
} from "@/lib/governance/types";

function isNonEmpty(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

function hasNonEmptyGoals(goals: string[]): boolean {
  return goals.some((goal) => isNonEmpty(goal));
}

function hasValidRequiredSlots(
  slots: GovernanceWorkflowInput["requiredSlots"]
): boolean {
  return slots.some((slot) => isNonEmpty(slot.key) && isNonEmpty(slot.label));
}

export function validateGovernanceConfig(
  config: GovernanceDraftConfig
): GovernanceValidationIssue[] {
  const issues: GovernanceValidationIssue[] = [];

  if (!isNonEmpty(config.globalRules.grounding)) {
    issues.push({
      path: "globalRules.grounding",
      message: "Grounding-Regeln sind erforderlich.",
    });
  }
  if (!isNonEmpty(config.globalRules.fallbackBehavior)) {
    issues.push({
      path: "globalRules.fallbackBehavior",
      message: "Fallback-Verhalten ist erforderlich.",
    });
  }
  if (!isNonEmpty(config.toneVocabulary.tonePrinciples)) {
    issues.push({
      path: "toneVocabulary.tonePrinciples",
      message: "Ton-Prinzipien sind erforderlich.",
    });
  }

  return issues;
}

export function validateWorkflow(
  workflow: GovernanceWorkflowInput | GovernanceWorkflow
): GovernanceValidationIssue[] {
  const issues: GovernanceValidationIssue[] = [];

  if (!isNonEmpty(workflow.slug)) {
    issues.push({ path: "slug", message: "Slug ist erforderlich." });
  }
  if (!isNonEmpty(workflow.name)) {
    issues.push({ path: "name", message: "Name ist erforderlich." });
  }
  if (!hasNonEmptyGoals(workflow.goals)) {
    issues.push({
      path: "goals",
      message: "Mindestens ein Ziel ist erforderlich.",
    });
  }
  if (!isNonEmpty(workflow.fallback)) {
    issues.push({
      path: "fallback",
      message: "Fallback / Eskalation ist erforderlich.",
    });
  }
  if (!hasValidRequiredSlots(workflow.requiredSlots)) {
    issues.push({
      path: "requiredSlots",
      message: "Mindestens ein Pflicht-Slot (Key + Label) ist erforderlich.",
    });
  }

  return issues;
}

export function validateForPublish(
  config: GovernanceDraftConfig,
  workflows: GovernanceWorkflow[]
): GovernanceValidationIssue[] {
  const issues = validateGovernanceConfig(config);

  const enabledWorkflows = workflows.filter((w) => w.enabledGlobally);
  if (enabledWorkflows.length === 0) {
    issues.push({
      path: "workflows",
      message: "Mindestens ein global aktivierter Workflow ist erforderlich.",
    });
  }

  for (const workflow of workflows) {
    for (const issue of validateWorkflow(workflow)) {
      issues.push({
        path: `workflows.${workflow.slug}.${issue.path}`,
        message: `${workflow.name}: ${issue.message}`,
      });
    }
  }

  const slugs = new Set<string>();
  for (const workflow of workflows) {
    if (slugs.has(workflow.slug)) {
      issues.push({
        path: `workflows.${workflow.slug}`,
        message: `Doppelter Workflow-Slug: ${workflow.slug}`,
      });
    }
    slugs.add(workflow.slug);
  }

  return issues;
}

export function canPublish(
  config: GovernanceDraftConfig,
  workflows: GovernanceWorkflow[]
): boolean {
  return validateForPublish(config, workflows).length === 0;
}
