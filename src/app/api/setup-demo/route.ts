import { NextResponse, type NextRequest } from "next/server";

import {
  completeSetupDemoAgentStep,
  completeSetupDemoPhoneStep,
  getSetupDemoState,
  restartSetupDemo,
  skipSetupDemo,
} from "@/lib/setup-demo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getSetupDemoState();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    console.error("[setup-demo]", error);
    return NextResponse.json(
      { ok: false, error: "Demo-Status konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    body = {};
  }

  try {
    switch (body.action) {
      case "skip":
        return NextResponse.json({ ok: true, ...(await skipSetupDemo()) });
      case "restart":
        return NextResponse.json({ ok: true, ...(await restartSetupDemo()) });
      case "complete_agent":
        return NextResponse.json({
          ok: true,
          ...(await completeSetupDemoAgentStep()),
        });
      case "complete_phone":
        return NextResponse.json({
          ok: true,
          ...(await completeSetupDemoPhoneStep()),
        });
      default:
        return NextResponse.json(
          { ok: false, error: "Unbekannte Aktion." },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[setup-demo]", error);
    return NextResponse.json(
      { ok: false, error: "Aktion fehlgeschlagen." },
      { status: 500 }
    );
  }
}
