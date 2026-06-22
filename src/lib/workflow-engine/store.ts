import "server-only";

import { listGovernanceWorkflows } from "@/lib/governance/store";
import type { GovernanceWorkflow } from "@/lib/governance/types";
import {
  buildWorkflowDefinitionFromGovernance,
  compileWorkflowDefinition,
} from "@/lib/workflow-engine/definition-compiler";
import type {
  CompiledWorkflowDefinition,
  WorkflowDefinition,
  WorkflowDefinitionRecord,
  WorkflowDefinitionVersion,
  WorkflowTestCase,
} from "@/lib/workflow-engine/types";
import { createAdminClient } from "@/lib/supabase/admin";

function rowToDefinition(row: Record<string, unknown>): WorkflowDefinitionRecord {
  return {
    id: String(row.id),
    governanceWorkflowId: String(row.governance_workflow_id),
    slug: String(row.slug),
    definition: row.definition as WorkflowDefinition,
    currentVersion: Number(row.current_version ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToVersion(row: Record<string, unknown>): WorkflowDefinitionVersion {
  return {
    id: String(row.id),
    definitionId: String(row.definition_id),
    versionNumber: Number(row.version_number),
    definitionSnapshot: row.definition_snapshot as WorkflowDefinition,
    compiled: row.compiled as CompiledWorkflowDefinition,
    notes: row.notes ? String(row.notes) : undefined,
    publishedAt: String(row.published_at),
  };
}

export async function ensureWorkflowDefinitions(): Promise<void> {
  const workflows = await listGovernanceWorkflows();
  const admin = createAdminClient();

  for (const workflow of workflows) {
    const { data: existing } = await admin
      .from("workflow_definitions")
      .select("id")
      .eq("slug", workflow.slug)
      .maybeSingle();

    if (existing) continue;

    const definition = buildWorkflowDefinitionFromGovernance(workflow);
    await admin.from("workflow_definitions").insert({
      governance_workflow_id: workflow.id,
      slug: workflow.slug,
      definition,
      current_version: 0,
    });
  }
}

export async function getWorkflowDefinitionBySlug(
  slug: string
): Promise<WorkflowDefinitionRecord | null> {
  await ensureWorkflowDefinitions();
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_definitions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data ? rowToDefinition(data) : null;
}

export async function listWorkflowDefinitions(): Promise<WorkflowDefinitionRecord[]> {
  await ensureWorkflowDefinitions();
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_definitions")
    .select("*")
    .order("slug");
  return (data ?? []).map(rowToDefinition);
}

export async function updateWorkflowDefinitionDraft(
  definitionId: string,
  definition: WorkflowDefinition
): Promise<WorkflowDefinitionRecord> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workflow_definitions")
    .update({
      definition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", definitionId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Workflow-Definition konnte nicht gespeichert werden.");
  }
  return rowToDefinition(data);
}

export async function syncDefinitionFromGovernance(
  workflow: GovernanceWorkflow
): Promise<WorkflowDefinitionRecord> {
  await ensureWorkflowDefinitions();
  const admin = createAdminClient();
  const existing = await getWorkflowDefinitionBySlug(workflow.slug);
  const definition = buildWorkflowDefinitionFromGovernance(workflow, {
    version: existing?.currentVersion ?? 0,
    strictMode: workflow.slug === "rechtsauskunft",
    ...(existing?.definition.steps?.length
      ? {
          steps: existing.definition.steps,
          allowedTools: existing.definition.allowedTools,
          kbSources: existing.definition.kbSources,
        }
      : {}),
  });

  if (existing) {
    return updateWorkflowDefinitionDraft(existing.id, definition);
  }

  const { data, error } = await admin
    .from("workflow_definitions")
    .insert({
      governance_workflow_id: workflow.id,
      slug: workflow.slug,
      definition,
      current_version: 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Workflow-Definition konnte nicht angelegt werden.");
  }
  return rowToDefinition(data);
}

export async function publishWorkflowDefinition(input: {
  definitionId: string;
  notes?: string;
}): Promise<WorkflowDefinitionVersion> {
  const admin = createAdminClient();
  const { data: defRow, error: defError } = await admin
    .from("workflow_definitions")
    .select("*")
    .eq("id", input.definitionId)
    .single();

  if (defError || !defRow) {
    throw new Error("Workflow-Definition nicht gefunden.");
  }

  const record = rowToDefinition(defRow);
  const nextVersion = record.currentVersion + 1;
  const definition: WorkflowDefinition = {
    ...record.definition,
    version: nextVersion,
  };
  const compiled = compileWorkflowDefinition(definition);

  const { data: versionRow, error: versionError } = await admin
    .from("workflow_definition_versions")
    .insert({
      definition_id: input.definitionId,
      version_number: nextVersion,
      definition_snapshot: definition,
      compiled,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (versionError || !versionRow) {
    throw new Error(versionError?.message ?? "Publish fehlgeschlagen.");
  }

  await admin
    .from("workflow_definitions")
    .update({
      definition,
      current_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.definitionId);

  return rowToVersion(versionRow);
}

export async function getPublishedWorkflowDefinition(
  slug: string
): Promise<{ definition: WorkflowDefinition; compiled: CompiledWorkflowDefinition } | null> {
  const record = await getWorkflowDefinitionBySlug(slug);
  if (!record || record.currentVersion <= 0) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_definition_versions")
    .select("*")
    .eq("definition_id", record.id)
    .eq("version_number", record.currentVersion)
    .maybeSingle();

  if (!data) return null;
  const version = rowToVersion(data);
  return {
    definition: version.definitionSnapshot,
    compiled: version.compiled,
  };
}

export async function listWorkflowDefinitionVersions(
  definitionId: string
): Promise<WorkflowDefinitionVersion[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_definition_versions")
    .select("*")
    .eq("definition_id", definitionId)
    .order("version_number", { ascending: false });
  return (data ?? []).map(rowToVersion);
}

export async function rollbackWorkflowDefinition(
  definitionId: string,
  versionNumber: number
): Promise<WorkflowDefinitionVersion> {
  const admin = createAdminClient();
  const { data: versionRow, error } = await admin
    .from("workflow_definition_versions")
    .select("*")
    .eq("definition_id", definitionId)
    .eq("version_number", versionNumber)
    .single();

  if (error || !versionRow) {
    throw new Error("Version nicht gefunden.");
  }

  const version = rowToVersion(versionRow);
  await admin
    .from("workflow_definitions")
    .update({
      definition: version.definitionSnapshot,
      current_version: version.versionNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", definitionId);

  return version;
}

export async function listWorkflowTestCases(
  definitionId: string
): Promise<WorkflowTestCase[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_test_cases")
    .select("*")
    .eq("definition_id", definitionId)
    .order("created_at");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    definitionId: String(row.definition_id),
    name: String(row.name),
    channel: row.channel as WorkflowTestCase["channel"],
    inputText: String(row.input_text),
    expectedSlug: row.expected_slug ? String(row.expected_slug) : undefined,
    expectedSlots: (row.expected_slots ?? {}) as Record<string, string>,
    forbiddenOutputs: (row.forbidden_outputs ?? []) as string[],
    mustEscalate: Boolean(row.must_escalate),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function upsertWorkflowTestCase(input: {
  id?: string;
  definitionId: string;
  name: string;
  channel: WorkflowTestCase["channel"];
  inputText: string;
  expectedSlug?: string;
  expectedSlots?: Record<string, string>;
  forbiddenOutputs?: string[];
  mustEscalate?: boolean;
}): Promise<WorkflowTestCase> {
  const admin = createAdminClient();
  const payload = {
    definition_id: input.definitionId,
    name: input.name.trim(),
    channel: input.channel,
    input_text: input.inputText.trim(),
    expected_slug: input.expectedSlug?.trim() || null,
    expected_slots: input.expectedSlots ?? {},
    forbidden_outputs: input.forbiddenOutputs ?? [],
    must_escalate: Boolean(input.mustEscalate),
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data } = await admin
      .from("workflow_test_cases")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (!data) throw new Error("Test-Case konnte nicht aktualisiert werden.");
    return (await listWorkflowTestCases(input.definitionId)).find(
      (t) => t.id === input.id
    )!;
  }

  const { data } = await admin
    .from("workflow_test_cases")
    .insert(payload)
    .select("*")
    .single();
  if (!data) throw new Error("Test-Case konnte nicht angelegt werden.");
  return (await listWorkflowTestCases(input.definitionId)).find(
    (t) => t.id === String(data.id)
  )!;
}

export async function seedRechtsauskunftTestCases(): Promise<void> {
  const { RECHTSAUSKUNFT_TEST_CASES } = await import(
    "@/lib/workflow-engine/defaults"
  );
  const def = await getWorkflowDefinitionBySlug("rechtsauskunft");
  if (!def) return;

  const existing = await listWorkflowTestCases(def.id);
  if (existing.length > 0) return;

  for (const testCase of RECHTSAUSKUNFT_TEST_CASES) {
    await upsertWorkflowTestCase({
      definitionId: def.id,
      name: testCase.name,
      channel: testCase.channel,
      inputText: testCase.inputText,
      expectedSlug: testCase.expectedSlug,
      forbiddenOutputs: testCase.forbiddenOutputs,
      mustEscalate: testCase.mustEscalate,
    });
  }
}
