import type {
  CompiledGovernance,
  CompiledWorkflowBlock,
  GovernanceChannel,
  GovernanceDraftConfig,
  GovernancePreview,
  GovernanceWorkflow,
  WorkflowChannelVariant,
} from "@/lib/governance/types";
import { validateForPublish } from "@/lib/governance/validate";

function formatSlotList(
  slots: GovernanceWorkflow["requiredSlots"],
  label: string
): string {
  const items = slots
    .filter((slot) => slot.key.trim() && slot.label.trim())
    .map((slot) => {
      const desc = slot.description?.trim();
      return desc
        ? `- **${slot.label}** (\`${slot.key}\`): ${desc}`
        : `- **${slot.label}** (\`${slot.key}\`)`;
    });
  if (items.length === 0) return "";
  return `${label}:\n${items.join("\n")}`;
}

function formatGoals(goals: string[]): string {
  const items = goals.filter((g) => g.trim()).map((g) => `- ${g.trim()}`);
  return items.length ? items.join("\n") : "- (keine Ziele definiert)";
}

function formatGlossary(config: GovernanceDraftConfig): string {
  const entries = config.toneVocabulary.glossary
    .filter((e) => e.term.trim())
    .map((e) => {
      const avoid =
        e.avoid?.filter(Boolean).length > 0
          ? ` — vermeiden: ${e.avoid.filter(Boolean).join(", ")}`
          : "";
      return `- **${e.term}**: bevorzugt «${e.preferred}»${avoid}`;
    });
  return entries.length ? entries.join("\n") : "";
}

function formatForbidden(phrases: string[]): string {
  const items = phrases.filter((p) => p.trim()).map((p) => `- «${p.trim()}»`);
  return items.length ? items.join("\n") : "";
}

function formatExamples(
  examples: GovernanceWorkflow["examples"],
  channel: GovernanceChannel
): string {
  const filtered = examples.filter((e) => e.channel === channel && e.dialogue.trim());
  if (!filtered.length) return "";
  return filtered
    .map((e, i) => `Beispiel ${i + 1}:\n${e.dialogue.trim()}`)
    .join("\n\n");
}

function formatOutputSchema(schema: GovernanceWorkflow["outputSchema"]): string {
  const fields = schema
    .filter((f) => f.key.trim() && f.label.trim())
    .map((f) => `- \`${f.key}\` (${f.type}): ${f.label}`);
  return fields.length ? fields.join("\n") : "";
}

function formatChannelVariant(
  variant: WorkflowChannelVariant,
  channel: GovernanceChannel
): string {
  const parts: string[] = [];
  if (variant.instructions.trim()) {
    parts.push(variant.instructions.trim());
  }
  if (variant.slotCollection?.trim()) {
    parts.push(`**Informationserhebung (${channel}):** ${variant.slotCollection.trim()}`);
  }
  if (variant.escalation?.trim()) {
    parts.push(`**Eskalation (${channel}):** ${variant.escalation.trim()}`);
  }
  return parts.join("\n");
}

export function compileGlobalBlock(
  config: GovernanceDraftConfig,
  channel: GovernanceChannel
): string {
  const channelSection =
    channel === "voice"
      ? `# Kanal: Telefon (Voice)
**Live-Antwort:** ${config.channelSettings.voice.liveResponseHints.trim()}
**Sprechstil:** ${config.channelSettings.voice.speechStyle.trim()}
**Weiterleitung:** ${config.channelSettings.voice.transferRules.trim()}`
      : `# Kanal: Nachrichten (schriftlich)
**Modus:** ${config.channelSettings.message.suggestionMode.trim()}
**Unsicherheit:** ${config.channelSettings.message.uncertaintyHints.trim()}
**Entwurfsstil:** ${config.channelSettings.message.draftStyle.trim()}`;

  const toneExamples = config.toneVocabulary.toneExamples
    .filter((e) => e.trim())
    .map((e) => `- ${e.trim()}`)
    .join("\n");

  return `# Zentrale Agenten-Regeln (Governance v${channel})

## Grounding & Anti-Halluzination
${config.globalRules.grounding.trim()}

**Bei Unbekanntem:** ${config.globalRules.fallbackBehavior.trim()}

## Datenschutz
${config.globalRules.privacy.trim()}

## Eskalation (global)
${config.globalRules.escalationGlobal.trim()}

## Ton & Stil (Prinzipien, nicht Skript)
${config.toneVocabulary.tonePrinciples.trim()}

${toneExamples ? `**Ton-Beispiele (Orientierung, nicht wörtlich vorlesen):**\n${toneExamples}` : ""}

## Vokabular / Glossar
${formatGlossary(config) || "(keine Einträge)"}

${formatForbidden(config.toneVocabulary.forbiddenPhrases) ? `## Zu vermeidende Formulierungen\n${formatForbidden(config.toneVocabulary.forbiddenPhrases)}` : ""}

${channelSection}

---
Wichtig: Formuliere natürlich und flüssig. Diese Regeln geben Ziele, Constraints und Pflichtangaben vor — nicht Wort-für-Wort-Skripte.`;
}

export function compileWorkflowBlock(
  workflow: GovernanceWorkflow,
  channel: GovernanceChannel
): string {
  const variant =
    channel === "voice" ? workflow.voiceVariant : workflow.messageVariant;
  const required = formatSlotList(workflow.requiredSlots, "Pflichtangaben");
  const optional = formatSlotList(workflow.optionalSlots, "Optionale Angaben");
  const examples = formatExamples(workflow.examples, channel);
  const output = formatOutputSchema(workflow.outputSchema);

  return `# Workflow: ${workflow.name}

**Trigger:** ${workflow.triggerIntent.trim() || workflow.description.trim()}

## Ziele
${formatGoals(workflow.goals)}

${required}

${optional ? `${optional}\n` : ""}## Geschäftslogik
${workflow.businessRules.trim() || "(keine spezifischen Regeln)"}

## Kanal-Variante (${channel})
${formatChannelVariant(variant, channel) || "(keine kanal-spezifischen Hinweise)"}

## Fallback
${workflow.fallback.trim()}

${output ? `## Output-Felder (strukturierte Zusammenfassung)\n${output}` : ""}

${examples ? `## Beispiele (Ton-Orientierung)\n${examples}` : ""}`;
}

export function compileGovernance(
  config: GovernanceDraftConfig,
  workflows: GovernanceWorkflow[],
  version = 0
): CompiledGovernance {
  const sorted = [...workflows].sort((a, b) => a.sortOrder - b.sortOrder);

  const workflowBlocks: CompiledWorkflowBlock[] = sorted.map((workflow) => ({
    workflowId: workflow.id,
    slug: workflow.slug,
    voiceBlock: compileWorkflowBlock(workflow, "voice"),
    messageBlock: compileWorkflowBlock(workflow, "message"),
    enabledGlobally: workflow.enabledGlobally,
  }));

  return {
    version,
    globalVoiceBlock: compileGlobalBlock(config, "voice"),
    globalMessageBlock: compileGlobalBlock(config, "message"),
    workflows: workflowBlocks,
  };
}

export function buildGovernancePromptBlock(
  compiled: CompiledGovernance,
  channel: GovernanceChannel,
  enabledWorkflowSlugs: Set<string>
): string {
  const workflowBlocks = compiled.workflows
    .filter((w) => enabledWorkflowSlugs.has(w.slug))
    .map((w) => (channel === "voice" ? w.voiceBlock : w.messageBlock));

  if (workflowBlocks.length === 0) {
    return channel === "voice"
      ? compiled.globalVoiceBlock
      : compiled.globalMessageBlock;
  }

  const global =
    channel === "voice"
      ? compiled.globalVoiceBlock
      : compiled.globalMessageBlock;

  return [global, "## Aktive Workflows", ...workflowBlocks].join("\n\n");
}

export function buildGovernancePreview(
  config: GovernanceDraftConfig,
  workflows: GovernanceWorkflow[],
  previous?: CompiledGovernance | null
): GovernancePreview {
  const compiled = compileGovernance(config, workflows, (previous?.version ?? 0) + 1);

  const workflowChanges = workflows.map((workflow) => {
    const prev = previous?.workflows.find((w) => w.slug === workflow.slug);
    const next = compiled.workflows.find((w) => w.slug === workflow.slug);
    return {
      slug: workflow.slug,
      voiceChanged: prev?.voiceBlock !== next?.voiceBlock,
      messageChanged: prev?.messageBlock !== next?.messageBlock,
      isNew: !prev,
      isRemoved: false,
    };
  });

  if (previous) {
    for (const prev of previous.workflows) {
      if (!workflows.some((w) => w.slug === prev.slug)) {
        workflowChanges.push({
          slug: prev.slug,
          voiceChanged: true,
          messageChanged: true,
          isNew: false,
          isRemoved: true,
        });
      }
    }
  }

  return {
    compiled,
    validationIssues: validateForPublish(config, workflows),
    diff: {
      globalVoiceChanged:
        !previous || previous.globalVoiceBlock !== compiled.globalVoiceBlock,
      globalMessageChanged:
        !previous || previous.globalMessageBlock !== compiled.globalMessageBlock,
      workflowChanges,
    },
  };
}
