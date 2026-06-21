import "server-only";

import {
  DEFAULT_GOVERNANCE_CONFIG,
  DEFAULT_GOVERNANCE_WORKFLOWS,
  normalizeWorkflow,
} from "@/lib/governance/defaults";
import type {
  CompiledGovernance,
  GovernanceDraftConfig,
  GovernanceVersion,
  GovernanceWorkflow,
  GovernanceWorkflowInput,
} from "@/lib/governance/types";
import { createAdminClient } from "@/lib/supabase/admin";

function mergeConfig(
  partial: Partial<GovernanceDraftConfig> | Record<string, unknown>
): GovernanceDraftConfig {
  const p = partial as Partial<GovernanceDraftConfig>;
  return {
    globalRules: {
      ...DEFAULT_GOVERNANCE_CONFIG.globalRules,
      ...p.globalRules,
    },
    toneVocabulary: {
      ...DEFAULT_GOVERNANCE_CONFIG.toneVocabulary,
      ...p.toneVocabulary,
      glossary:
        p.toneVocabulary?.glossary ??
        DEFAULT_GOVERNANCE_CONFIG.toneVocabulary.glossary,
      toneExamples:
        p.toneVocabulary?.toneExamples ??
        DEFAULT_GOVERNANCE_CONFIG.toneVocabulary.toneExamples,
      forbiddenPhrases:
        p.toneVocabulary?.forbiddenPhrases ??
        DEFAULT_GOVERNANCE_CONFIG.toneVocabulary.forbiddenPhrases,
    },
    channelSettings: {
      voice: {
        ...DEFAULT_GOVERNANCE_CONFIG.channelSettings.voice,
        ...p.channelSettings?.voice,
      },
      message: {
        ...DEFAULT_GOVERNANCE_CONFIG.channelSettings.message,
        ...p.channelSettings?.message,
      },
    },
  };
}

function workflowToRow(input: GovernanceWorkflowInput) {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    trigger_intent: input.triggerIntent.trim(),
    goals: input.goals.filter((g) => g.trim()),
    required_slots: input.requiredSlots.filter(
      (s) => s.key.trim() && s.label.trim()
    ),
    optional_slots: input.optionalSlots.filter(
      (s) => s.key.trim() && s.label.trim()
    ),
    business_rules: input.businessRules.trim(),
    voice_variant: input.voiceVariant,
    message_variant: input.messageVariant,
    fallback: input.fallback.trim(),
    output_schema: input.outputSchema,
    examples: input.examples,
    enabled_globally: input.enabledGlobally,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

async function ensureConfigRow() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_governance_config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  if (!data) {
    await admin.from("agent_governance_config").insert({
      id: 1,
      global_rules: DEFAULT_GOVERNANCE_CONFIG.globalRules,
      tone_vocabulary: DEFAULT_GOVERNANCE_CONFIG.toneVocabulary,
      channel_settings: DEFAULT_GOVERNANCE_CONFIG.channelSettings,
      current_version: 0,
    });
  }
}

async function ensureDefaultWorkflows() {
  const admin = createAdminClient();

  for (const workflow of DEFAULT_GOVERNANCE_WORKFLOWS) {
    const { data } = await admin
      .from("agent_governance_workflows")
      .select("id")
      .eq("slug", workflow.slug)
      .maybeSingle();

    if (!data) {
      await admin.from("agent_governance_workflows").insert(workflowToRow(workflow));
    }
  }
}

export async function getGovernanceDraft(): Promise<{
  config: GovernanceDraftConfig;
  currentVersion: number;
}> {
  await ensureConfigRow();
  await ensureDefaultWorkflows();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_config")
    .select("global_rules, tone_vocabulary, channel_settings, current_version")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return {
    config: mergeConfig({
      globalRules: data.global_rules as GovernanceDraftConfig["globalRules"],
      toneVocabulary: data.tone_vocabulary as GovernanceDraftConfig["toneVocabulary"],
      channelSettings: data.channel_settings as GovernanceDraftConfig["channelSettings"],
    }),
    currentVersion: Number(data.current_version ?? 0),
  };
}

export async function updateGovernanceDraft(
  patch: Partial<GovernanceDraftConfig>
): Promise<GovernanceDraftConfig> {
  await ensureConfigRow();
  const { config: current } = await getGovernanceDraft();
  const merged = mergeConfig({ ...current, ...patch });

  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_governance_config")
    .update({
      global_rules: merged.globalRules,
      tone_vocabulary: merged.toneVocabulary,
      channel_settings: merged.channelSettings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw error;
  return merged;
}

export async function listGovernanceWorkflows(): Promise<GovernanceWorkflow[]> {
  await ensureDefaultWorkflows();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_workflows")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => normalizeWorkflow(row));
}

export async function getGovernanceWorkflow(
  id: string
): Promise<GovernanceWorkflow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeWorkflow(data) : null;
}

export async function createGovernanceWorkflow(
  input: GovernanceWorkflowInput
): Promise<GovernanceWorkflow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_workflows")
    .insert(workflowToRow(input))
    .select("*")
    .single();

  if (error) throw error;
  return normalizeWorkflow(data);
}

export async function updateGovernanceWorkflow(
  id: string,
  input: GovernanceWorkflowInput
): Promise<GovernanceWorkflow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_workflows")
    .update(workflowToRow(input))
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeWorkflow(data);
}

export async function deleteGovernanceWorkflow(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_governance_workflows")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function getTenantWorkflowOverrides(
  userId: string
): Promise<Record<string, boolean>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_workflow_tenants")
    .select("workflow_id, enabled")
    .eq("user_id", userId);

  if (error) throw error;

  const overrides: Record<string, boolean> = {};
  for (const row of data ?? []) {
    overrides[String(row.workflow_id)] = Boolean(row.enabled);
  }
  return overrides;
}

export async function setTenantWorkflowOverride(
  userId: string,
  workflowId: string,
  enabled: boolean
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("agent_governance_workflow_tenants").upsert(
    {
      user_id: userId,
      workflow_id: workflowId,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,workflow_id" }
  );
  if (error) throw error;
}

export async function getPublishedGovernance(): Promise<CompiledGovernance | null> {
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("agent_governance_config")
    .select("current_version")
    .eq("id", 1)
    .maybeSingle();

  const version = Number(config?.current_version ?? 0);
  if (version <= 0) return null;

  const { data, error } = await admin
    .from("agent_governance_versions")
    .select("compiled")
    .eq("version_number", version)
    .maybeSingle();

  if (error) throw error;
  return (data?.compiled as CompiledGovernance | null) ?? null;
}

export async function listGovernanceVersions(
  limit = 20
): Promise<GovernanceVersion[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_versions")
    .select("id, version_number, config_snapshot, compiled, notes, published_at")
    .order("version_number", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    versionNumber: Number(row.version_number),
    configSnapshot: row.config_snapshot as GovernanceVersion["configSnapshot"],
    compiled: row.compiled as CompiledGovernance,
    notes: row.notes ? String(row.notes) : undefined,
    publishedAt: String(row.published_at),
  }));
}

export async function savePublishedVersion(input: {
  versionNumber: number;
  configSnapshot: GovernanceVersion["configSnapshot"];
  compiled: CompiledGovernance;
  notes?: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { error: versionError } = await admin
    .from("agent_governance_versions")
    .insert({
      version_number: input.versionNumber,
      config_snapshot: input.configSnapshot,
      compiled: input.compiled,
      notes: input.notes?.trim() || null,
    });

  if (versionError) throw versionError;

  const { error: configError } = await admin
    .from("agent_governance_config")
    .update({
      current_version: input.versionNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (configError) throw configError;
}

export async function rollbackGovernanceVersion(
  versionNumber: number
): Promise<CompiledGovernance> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_governance_versions")
    .select("compiled, config_snapshot")
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("VERSION_NOT_FOUND");

  const snapshot = data.config_snapshot as GovernanceVersion["configSnapshot"];
  const compiled = data.compiled as CompiledGovernance;

  await updateGovernanceDraft(snapshot.config);

  for (const workflow of snapshot.workflows) {
    const existing = await getGovernanceWorkflow(workflow.id);
    if (existing) {
      const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = workflow;
      void _createdAt;
      void _updatedAt;
      await updateGovernanceWorkflow(id, rest);
    }
  }

  const { error: configError } = await admin
    .from("agent_governance_config")
    .update({
      current_version: versionNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (configError) throw configError;

  return compiled;
}
