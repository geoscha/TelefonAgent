import { NextResponse, type NextRequest } from "next/server";

import { describeElevenLabsError } from "@/lib/elevenlabs/client";
import { linkAgentToPhone } from "@/lib/elevenlabs/sync-agent";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { getSettings, updateSettings, type StoredAgent } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Assigns a phone number to an agent (or auto-assigns when only one exists). */
export async function POST(req: NextRequest) {
  let body: { agentId?: string; phoneNumberId?: string };
  try {
    body = (await req.json()) as { agentId?: string; phoneNumberId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent-ID fehlt." },
      { status: 400 }
    );
  }

  try {
    const userId = await requireUserId();
    const settings = await getSettings();
    const phones = await listUserPhoneNumbers(userId);
    const agents = settings.agents ?? [];

    if (!agents.some((a) => a.id === agentId)) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    let phoneNumberId = body.phoneNumberId?.trim();
    if (!phoneNumberId && phones.length === 1) {
      phoneNumberId = phones[0].id;
    }

    if (!phoneNumberId && phones.length > 1) {
      return NextResponse.json(
        { ok: false, error: "Bitte eine Telefonnummer auswählen." },
        { status: 400 }
      );
    }

    if (phoneNumberId && !phones.some((p) => p.id === phoneNumberId)) {
      return NextResponse.json(
        { ok: false, error: "Telefonnummer nicht gefunden." },
        { status: 404 }
      );
    }

    const updatedAgents: StoredAgent[] = agents.map((a) =>
      a.id === agentId ? { ...a, phoneNumberId } : a
    );

    const updated = await updateSettings({ agents: updatedAgents });

    if (settings.agentId === agentId && phoneNumberId) {
      await linkAgentToPhone(userId, agentId, phoneNumberId);
    }

    return NextResponse.json({ ok: true, settings: updated, agents: updatedAgents });
  } catch (error) {
    console.error("[agent/phone]", error);
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
