import { NextResponse, type NextRequest } from "next/server";

import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import { syncAgentConversationConfig, loadAgentEscalationContext } from "@/lib/elevenlabs/agent-sync";
import { confirmForwardingSetup } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { forwardingType?: "alle" | "bedingt"; phoneId?: string; customerNumber?: string };
  try {
    body = (await req.json()) as {
      forwardingType?: "alle" | "bedingt";
      phoneId?: string;
      customerNumber?: string;
    };
  } catch {
    body = {};
  }

  const forwardingType = "alle" as const;

  try {
    await requireUserId();
    const state = await confirmForwardingSetup(forwardingType, {
      phoneId: body.phoneId,
      customerNumber: body.customerNumber,
    });

    const activeAgent = state.settings.agents?.find(
      (a) => a.id === state.settings.agentId
    );
    if (activeAgent) {
      try {
        await syncAgentConversationConfig(getElevenLabsClient(), activeAgent, {
          escalationContext: await loadAgentEscalationContext(activeAgent.id),
        });
      } catch (error) {
        console.warn("[phone/confirm-forwarding] agent resync skipped:", error);
      }
    }

    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
      numbers: await listUserPhoneNumbers(),
    });
  } catch (error) {
    console.error("[phone/confirm-forwarding]", error);
    return NextResponse.json(
      { ok: false, error: "Speichern fehlgeschlagen." },
      { status: 500 }
    );
  }
}
