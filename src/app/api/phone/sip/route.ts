import { NextResponse, type NextRequest } from "next/server";

import { describeElevenLabsError } from "@/lib/elevenlabs/client";
import { addSipTrunkPhoneNumber } from "@/lib/phone/numbers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    phoneNumber?: string;
    label?: string;
    outboundAddress?: string;
    outboundTransport?: "tcp" | "tls" | "udp";
    outboundUsername?: string;
    outboundPassword?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  if (!body.phoneNumber?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Telefonnummer ist erforderlich." },
      { status: 400 }
    );
  }

  try {
    const result = await addSipTrunkPhoneNumber({
      phoneNumber: body.phoneNumber,
      label: body.label,
      outboundAddress: body.outboundAddress,
      outboundTransport: body.outboundTransport,
      outboundUsername: body.outboundUsername,
      outboundPassword: body.outboundPassword,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true, phone: result.phone });
  } catch (error) {
    console.error("[phone/sip]", error);
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
