import "server-only";

import { buildGovernancePreview, compileGovernance } from "@/lib/governance/compiler";
import {
  getGovernanceDraft,
  getPublishedGovernance,
  listGovernanceWorkflows,
  savePublishedVersion,
} from "@/lib/governance/store";
import type { CompiledGovernance, GovernancePreview } from "@/lib/governance/types";
import { canPublish, validateForPublish } from "@/lib/governance/validate";
import {
  primeGovernanceCache,
} from "@/lib/governance/runtime";
import { resyncAllVoiceAgentsAfterGovernancePublish } from "@/lib/governance/resync-agents";

export async function previewGovernancePublish(): Promise<GovernancePreview> {
  const { config } = await getGovernanceDraft();
  const workflows = await listGovernanceWorkflows();
  const previous = await getPublishedGovernance();
  return buildGovernancePreview(config, workflows, previous);
}

export async function publishGovernance(notes?: string): Promise<{
  version: number;
  compiled: CompiledGovernance;
}> {
  const { config, currentVersion } = await getGovernanceDraft();
  const workflows = await listGovernanceWorkflows();

  const issues = validateForPublish(config, workflows);
  if (issues.length > 0) {
    throw new Error(
      `VALIDATION_FAILED: ${issues.map((i) => i.message).join("; ")}`
    );
  }

  const versionNumber = currentVersion + 1;
  const compiled = compileGovernance(config, workflows, versionNumber);

  await savePublishedVersion({
    versionNumber,
    configSnapshot: { config, workflows },
    compiled,
    notes,
  });

  primeGovernanceCache(compiled);

  void resyncAllVoiceAgentsAfterGovernancePublish()
    .then((stats) => {
      console.info("[governance/publish] voice agent resync", stats);
    })
    .catch((error) => {
      console.warn("[governance/publish] voice agent resync failed", error);
    });

  return { version: versionNumber, compiled };
}

export async function isGovernancePublishable(): Promise<boolean> {
  const { config } = await getGovernanceDraft();
  const workflows = await listGovernanceWorkflows();
  return canPublish(config, workflows);
}
