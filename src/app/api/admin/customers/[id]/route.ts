import { NextResponse, type NextRequest } from "next/server";

import {
  getAdminCustomer,
  updateAdminCustomer,
} from "@/lib/admin/customers";
import { requireAdminSession } from "@/lib/admin/guard";
import type {
  ElevenLabsSettings,
  ForwardingStatus,
  ForwardingType,
  Profile,
} from "@/lib/store";
import type { OnboardingPhase } from "@/lib/onboarding-types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const customer = await getAdminCustomer(params.id);
  if (!customer) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, customer });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    profile?: Partial<Profile>;
    settings?: Partial<ElevenLabsSettings>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const profilePatch: Partial<Profile> = {};
  if (typeof body.profile?.name === "string") profilePatch.name = body.profile.name.trim();
  if (typeof body.profile?.email === "string") profilePatch.email = body.profile.email.trim();

  const settingsPatch: Partial<ElevenLabsSettings> = {};
  const s = body.settings ?? {};
  if (typeof s.onboardingPhase === "string") {
    settingsPatch.onboardingPhase = s.onboardingPhase as OnboardingPhase;
  }
  if (typeof s.curaForwardingNumber === "string") {
    settingsPatch.curaForwardingNumber = s.curaForwardingNumber.trim() || undefined;
  }
  if (s.forwardingStatus === "nicht_eingerichtet" || s.forwardingStatus === "anleitung" || s.forwardingStatus === "aktiv") {
    settingsPatch.forwardingStatus = s.forwardingStatus as ForwardingStatus;
  }
  if (s.forwardingType === "alle" || s.forwardingType === "bedingt") {
    settingsPatch.forwardingType = s.forwardingType as ForwardingType;
  }
  if (typeof s.agentName === "string") settingsPatch.agentName = s.agentName.trim();
  if (typeof s.customerNumber === "string") {
    settingsPatch.customerNumber = s.customerNumber.trim();
  }
  if (typeof s.forwardingInstructions === "string") {
    settingsPatch.forwardingInstructions = s.forwardingInstructions;
  }
  if (typeof s.connected === "boolean") settingsPatch.connected = s.connected;

  try {
    const customer = await updateAdminCustomer(params.id, {
      profile: profilePatch,
      settings: settingsPatch,
    });
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    console.error("[admin/customers/id]", error);
    return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
  }
}
