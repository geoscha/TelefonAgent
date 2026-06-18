"use client";

import { useStaleFetch } from "@/lib/hooks/useStaleFetch";
import type { OnboardingPhase, StoredAgent } from "@/lib/onboarding-types";
import type { UserPhoneNumberView } from "@/components/telefonagent/PhoneNumberWizard";

export interface WorkspaceCapabilities {
  hasApiKey: boolean;
  enrichmentEnabled: boolean;
  forwardingNumber: string | null;
  defaultSystemPrompt: string;
}

export interface WorkspaceSettings {
  connected: boolean;
  workspaceInfo?: string;
  agentId?: string;
  agentName?: string;
  voiceId?: string;
  voiceName?: string;
  language?: string;
  greeting?: string;
  systemPrompt?: string;
  customerNumber?: string;
  forwardingType?: string;
  forwardingStatus?: string;
  curaForwardingNumber?: string;
  onboardingPhase?: OnboardingPhase;
  agents?: StoredAgent[];
  appointmentBookingEnabled?: boolean;
  appointmentProvider?: string;
}

export interface WorkspaceData {
  ok: true;
  phase: OnboardingPhase;
  pendingRequest?: { id: string; createdAt: string } | null;
  pendingRequests: Array<{ id: string; createdAt: string }>;
  settings: WorkspaceSettings;
  numbers: UserPhoneNumberView[];
  capabilities: WorkspaceCapabilities;
}

async function fetchWorkspace(): Promise<WorkspaceData> {
  const res = await fetch("/api/workspace");
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("workspace load failed");
  return data as WorkspaceData;
}

export function useWorkspace() {
  return useStaleFetch<WorkspaceData>("workspace", fetchWorkspace, {
    ttlMs: 90_000,
  });
}
