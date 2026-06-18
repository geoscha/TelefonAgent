import type { AgentConfig } from "@/lib/types";
import { mockAgentConfig } from "@/lib/mock/agent";

export async function getAgentConfig(): Promise<AgentConfig> {
  // TODO: Fetch from Supabase / ElevenLabs
  return mockAgentConfig;
}

export async function updateAgentConfig(
  config: Partial<AgentConfig>
): Promise<AgentConfig> {
  // TODO: Persist to Supabase and sync with ElevenLabs
  return { ...mockAgentConfig, ...config };
}

export async function connectPhoneNumber(
  phoneNumber: string
): Promise<{ success: boolean; message: string }> {
  // TODO: Integrate with Twilio provisioning flow
  if (!phoneNumber.startsWith("+41")) {
    return { success: false, message: "Nur Schweizer Nummern (+41) werden unterstützt." };
  }
  return { success: true, message: "Telefonnummer erfolgreich verbunden (Mock)." };
}
