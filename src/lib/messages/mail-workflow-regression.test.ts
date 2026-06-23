import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  ALLGEMEINE_AUSKUNFT_DEFINITION,
  DAMAGE_THREAD_PARTIAL_SLOTS,
  DAMAGE_THREAD_TEXT,
  FIXTURE_AGENT_ID,
  FIXTURE_THREAD_ID,
  FIXTURE_USER_ID,
  makeSession,
  NEBENKOSTEN_THREAD_TEXT,
  NOTFALL_THREAD_TEXT,
  SCHADENSFALL_DEFINITION,
} from "@/lib/messages/__tests__/workflow-fixtures";
import {
  applyWorkflowEngineEnforcement,
  DISPATCH_CONFIDENCE_FLOOR,
  effectiveDispatchWorkflowSlug,
  isInquiryDispatchReady,
  isWorkflowDispatchAllowed,
  NON_DISPATCH_WORKFLOW_SLUG,
  resolveMailWorkflowSession,
} from "@/lib/messages/inquiry-workflow-engine";
import { buildTextAssistantSystemPromptAsync } from "@/lib/text-assistant/prompt";
import { extractSlotsFromText, validateWorkflowSlots } from "@/lib/workflow-engine/slot-validator";
import { resolveWorkflowSession } from "@/lib/workflow-engine/session";

vi.mock("@/lib/workflow-engine/case-store", () => ({
  updateWorkflowExecution: vi.fn(async (_id: string, patch: { slots: Record<string, string> }) => ({
    id: "exec-fixture-1",
    userId: FIXTURE_USER_ID,
    workflowSlug: "schadensfall-meldung",
    workflowVersion: 1,
    channel: "message",
    slots: patch.slots,
    status: "active",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  getActiveExecutionForSource: vi.fn(),
  completeWorkflowExecution: vi.fn(),
}));

vi.mock("@/lib/workflow-engine/flags", () => ({
  isWorkflowEngineEnabledForUser: vi.fn(),
  isWorkflowEngineEnvEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/workflow-engine/session", () => ({
  resolveWorkflowSession: vi.fn(),
}));

vi.mock("@/lib/workflow-engine/store", () => ({
  getPublishedWorkflowDefinition: vi.fn(async (slug: string) =>
    slug === "schadensfall-meldung"
      ? {
          definition: SCHADENSFALL_DEFINITION,
          compiled: { messageBlock: "compiled", voiceBlock: "", routerHints: [] },
        }
      : slug === "allgemeine-auskunft"
        ? {
            definition: ALLGEMEINE_AUSKUNFT_DEFINITION,
            compiled: { messageBlock: "compiled", voiceBlock: "", routerHints: [] },
          }
        : null
  ),
  ensureWorkflowDefinitions: vi.fn(),
  listWorkflowDefinitions: vi.fn(async () => []),
}));

vi.mock("@/lib/integrations/website/store", () => ({
  getWebsiteIntegrationForUser: vi.fn(async () => null),
  getWebsiteIntegration: vi.fn(async () => null),
}));

vi.mock("@/lib/customers/craftsmen-kb", () => ({
  getCraftsmenKnowledgeForUser: vi.fn(async () => ({ text: null, docId: null, docName: null })),
}));

vi.mock("@/lib/governance/runtime", () => ({
  getGovernancePromptBlock: vi.fn(async () => "LEGACY_GOVERNANCE_ALL_WORKFLOWS"),
}));

vi.mock("@/lib/governance/store", () => ({
  getPublishedGovernance: vi.fn(async () => ({
    globalMessageBlock: "GLOBAL",
    globalVoiceBlock: "GLOBAL_VOICE",
  })),
}));

vi.mock("@/lib/elevenlabs/agent-sync", () => ({
  buildLiveAgentSystemPrompt: vi.fn(() => "AGENT"),
}));

import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import { getGovernancePromptBlock } from "@/lib/governance/runtime";

const mockAgent = {
  id: FIXTURE_AGENT_ID,
  name: "Test Agent",
  systemPrompt: "Du bist ein Assistent.",
  language: "de",
  appointmentBookingEnabled: false,
  euComplianceEnabled: false,
} as import("@/lib/onboarding-types").StoredAgent;

function dispatchActions() {
  return [
    {
      id: "act-dispatch",
      label: "Handwerker informieren",
      type: "contact_craftsman" as const,
      status: "pending" as const,
    },
    {
      id: "act-repair",
      label: "Reparatur planen",
      type: "schedule_repair" as const,
      status: "pending" as const,
    },
  ];
}

describe("mail workflow engine regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkflowEngineEnabledForUser).mockResolvedValue(true);
  });

  describe("divergence: Pfad A vs Pfad B session alignment", () => {
    it("wählt denselben Workflow und merged Slots bei gleichem Thread-Text", async () => {
      const session = makeSession(SCHADENSFALL_DEFINITION, DAMAGE_THREAD_TEXT, {
        routerConfidence: 0.82,
      });
      vi.mocked(resolveWorkflowSession).mockResolvedValue(session);

      const pathA = await resolveMailWorkflowSession({
        userId: FIXTURE_USER_ID,
        threadId: FIXTURE_THREAD_ID,
        threadText: DAMAGE_THREAD_TEXT,
        agentId: FIXTURE_AGENT_ID,
      });

      const pathBPrompt = await buildTextAssistantSystemPromptAsync(
        mockAgent,
        "email",
        FIXTURE_USER_ID,
        {
          userMessage: DAMAGE_THREAD_TEXT,
          sourceRef: `chat:${FIXTURE_AGENT_ID}:${FIXTURE_USER_ID}`,
        }
      );

      expect(pathA?.definition?.slug).toBe("schadensfall-meldung");
      expect(resolveWorkflowSession).toHaveBeenCalled();
      expect(pathBPrompt).toContain("schadensfall-meldung");
      expect(pathBPrompt).toContain("Schadensfall-Meldung");

      const llmSlots = DAMAGE_THREAD_PARTIAL_SLOTS;
      const enforced = await applyWorkflowEngineEnforcement({
        result: {
          actionable: true,
          draftReply: "Guten Tag, wir kümmern uns darum.",
          suggestedActions: dispatchActions(),
          workflowSlots: llmSlots,
        },
        session: pathA!,
        userId: FIXTURE_USER_ID,
      });

      const pathBSlots = {
        ...session.execution!.slots,
        ...llmSlots,
      };
      const validation = validateWorkflowSlots(SCHADENSFALL_DEFINITION, pathBSlots);

      expect(enforced.matchedWorkflow.slug).toBe(pathA!.definition!.slug);
      expect(enforced.workflowSlots).toEqual(pathBSlots);
      expect(enforced.workflowSlots?.name).toBe("Max Muster");
      expect(validation.missing.length).toBeGreaterThan(0);
    });
  });

  describe("slot enforcement", () => {
    it("fragt fehlende Pflicht-Slots nach und entfernt Dispatch-Aktionen", async () => {
      const session = makeSession(SCHADENSFALL_DEFINITION, DAMAGE_THREAD_TEXT);

      const result = await applyWorkflowEngineEnforcement({
        result: {
          actionable: true,
          draftReply: "Guten Tag, wir haben Ihre Meldung erhalten.",
          suggestedActions: dispatchActions(),
          craftsmanDrafts: [
            {
              id: "cd-1",
              recipientName: "Sanitär AG",
              recipientEmail: "info@sanitaer.test",
              subject: "Schaden",
              body: "Bitte Termin.",
            },
          ],
          workflowSlots: DAMAGE_THREAD_PARTIAL_SLOTS,
        },
        session,
        userId: FIXTURE_USER_ID,
      });

      expect(result.slotsComplete).toBe(false);
      expect(result.suggestedActions.some((a) => a.type === "contact_craftsman")).toBe(
        false
      );
      expect(result.craftsmanDrafts).toEqual([]);
      expect(result.draftReply).toMatch(/Ort im Objekt|Seit wann|Erreichbarkeit|Dringlichkeit/i);
      expect(
        isInquiryDispatchReady({
          matchedWorkflowSlug: result.matchedWorkflow.slug,
          workflowSlots: result.workflowSlots,
          definition: SCHADENSFALL_DEFINITION,
          routerConfidence: session.routerConfidence,
        })
      ).toBe(false);
    });
  });

  describe("notfall fixture", () => {
    it("bootstrap setzt urgency=hoch bei Notfall-Text", () => {
      const slots = extractSlotsFromText(SCHADENSFALL_DEFINITION, NOTFALL_THREAD_TEXT);
      expect(slots.urgency).toBe("hoch");
    });

    it("merged Slots behalten hohe Dringlichkeit", async () => {
      const session = makeSession(SCHADENSFALL_DEFINITION, NOTFALL_THREAD_TEXT);
      expect(session.execution?.slots.urgency).toBe("hoch");

      const result = await applyWorkflowEngineEnforcement({
        result: {
          actionable: true,
          draftReply:
            "Guten Tag, bei Gasgeruch bitte sofort Fenster öffnen, Flamme und Zündquellen meiden und die Feuerwehr (118) rufen.",
          suggestedActions: dispatchActions(),
          workflowSlots: {
            name: "Lisa Keller",
            object_address: "Seestrasse 5",
            damage_type: "Gasgeruch",
          },
        },
        session,
        userId: FIXTURE_USER_ID,
      });

      expect(result.workflowSlots?.urgency).toBe("hoch");
      expect(result.draftReply).toMatch(/118|Gas|Fenster|Flamme/i);
    });
  });

  describe("flag-off regression", () => {
    it("resolveMailWorkflowSession gibt null zurück wenn Engine aus", async () => {
      vi.mocked(isWorkflowEngineEnabledForUser).mockResolvedValue(false);

      const session = await resolveMailWorkflowSession({
        userId: FIXTURE_USER_ID,
        threadId: FIXTURE_THREAD_ID,
        threadText: DAMAGE_THREAD_TEXT,
        agentId: FIXTURE_AGENT_ID,
      });

      expect(session).toBeNull();
      expect(resolveWorkflowSession).not.toHaveBeenCalled();
    });

    it("buildTextAssistantSystemPromptAsync fällt auf Legacy-Governance zurück", async () => {
      vi.mocked(isWorkflowEngineEnabledForUser).mockResolvedValue(false);

      const prompt = await buildTextAssistantSystemPromptAsync(
        mockAgent,
        "email",
        FIXTURE_USER_ID,
        { userMessage: DAMAGE_THREAD_TEXT }
      );

      expect(getGovernancePromptBlock).toHaveBeenCalledWith("message", FIXTURE_USER_ID);
      expect(resolveWorkflowSession).not.toHaveBeenCalled();
      expect(prompt).not.toContain("Schadensfall-Meldung (schadensfall-meldung)");
    });
  });

  describe("negative: Nebenkostenabrechnung (Non-Dispatch-Verhalten)", () => {
    it("allgemeine-auskunft erlaubt keinen Handwerker-Dispatch", () => {
      expect(isWorkflowDispatchAllowed(NON_DISPATCH_WORKFLOW_SLUG)).toBe(false);
      expect(
        effectiveDispatchWorkflowSlug("schadensfall-meldung", DISPATCH_CONFIDENCE_FLOOR - 0.1)
      ).toBe(NON_DISPATCH_WORKFLOW_SLUG);
    });

    it("strippt Dispatch bei allgemeine-auskunft auch wenn LLM Handwerker vorschlägt", async () => {
      const session = makeSession(ALLGEMEINE_AUSKUNFT_DEFINITION, NEBENKOSTEN_THREAD_TEXT, {
        routerConfidence: 0.45,
      });

      const result = await applyWorkflowEngineEnforcement({
        result: {
          actionable: true,
          draftReply:
            "Guten Tag, zur Nebenkostenabrechnung: Der Heizungsanteil wird nach Verbrauch und Wohnfläche verteilt.",
          suggestedActions: dispatchActions(),
          workflowSlots: { inquiry_topic: "Nebenkostenabrechnung Heizung" },
        },
        session,
        userId: FIXTURE_USER_ID,
      });

      expect(result.matchedWorkflow.slug).toBe("allgemeine-auskunft");
      expect(result.dispatchAllowed).toBe(false);
      expect(result.suggestedActions.some((a) => a.type === "contact_craftsman")).toBe(
        false
      );
      expect(result.suggestedActions.some((a) => a.type === "schedule_repair")).toBe(
        false
      );
    });
  });
});
