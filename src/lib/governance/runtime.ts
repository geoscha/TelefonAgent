import "server-only";

import { buildGovernancePromptBlock } from "@/lib/governance/compiler";
import type { CompiledGovernance, GovernanceChannel } from "@/lib/governance/types";
import {
  getPublishedGovernance,
  getTenantWorkflowOverrides,
  listGovernanceWorkflows,
} from "@/lib/governance/store";

let cachedCompiled: CompiledGovernance | null | undefined;
let cacheVersion = -1;

export function invalidateGovernanceCache(): void {
  cachedCompiled = undefined;
  cacheVersion = -1;
}

async function loadPublished(): Promise<CompiledGovernance | null> {
  if (cachedCompiled !== undefined) return cachedCompiled;
  cachedCompiled = await getPublishedGovernance();
  cacheVersion = cachedCompiled?.version ?? 0;
  return cachedCompiled;
}

async function resolveEnabledWorkflowSlugs(
  userId?: string
): Promise<Set<string>> {
  const workflows = await listGovernanceWorkflows();
  const overrides = userId
    ? await getTenantWorkflowOverrides(userId)
    : {};

  const enabled = new Set<string>();

  for (const workflow of workflows) {
    const override = overrides[workflow.id];
    const isEnabled =
      override !== undefined ? override : workflow.enabledGlobally;
    if (isEnabled) enabled.add(workflow.slug);
  }

  return enabled;
}

export async function getGovernancePromptBlock(
  channel: GovernanceChannel,
  userId?: string
): Promise<string> {
  const compiled = await loadPublished();
  if (!compiled) return "";

  const enabledSlugs = await resolveEnabledWorkflowSlugs(userId);
  return buildGovernancePromptBlock(compiled, channel, enabledSlugs);
}

export async function getGovernanceCacheVersion(): Promise<number> {
  await loadPublished();
  return cacheVersion;
}

export function primeGovernanceCache(compiled: CompiledGovernance | null): void {
  cachedCompiled = compiled;
  cacheVersion = compiled?.version ?? 0;
}
