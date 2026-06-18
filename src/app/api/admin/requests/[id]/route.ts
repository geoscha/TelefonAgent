import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { listAdminPoolNumbers } from "@/lib/admin/number-pool";
import {
  getRequest,
  listRequests,
  updateRequest,
  type RequestStatus,
} from "@/lib/admin/requests";
import { suggestPhoneAssignments } from "@/lib/admin/suggest-numbers";
import { assignPhoneNumberToUser } from "@/lib/phone/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALID_STATUS: RequestStatus[] = [
  "offen",
  "in_arbeit",
  "erledigt",
  "abgelehnt",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const request = await getRequest(params.id);
  if (!request) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const [allOpen, pool] = await Promise.all([
    listRequests({ status: "offen" }),
    listAdminPoolNumbers(),
  ]);
  const inArbeit = await listRequests({ status: "in_arbeit" });
  const suggestions = suggestPhoneAssignments(
    [...allOpen, ...inArbeit],
    pool
  );

  return NextResponse.json({
    ok: true,
    request,
    suggestion: suggestions[params.id] ?? null,
    freeCount: pool.filter((n) => n.status === "frei").length,
  });
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
    status?: RequestStatus;
    payload?: Record<string, unknown>;
    type?: string;
    assignPhone?: {
      phoneNumber?: string;
      elevenLabsPhoneNumberId?: string;
      forwardingInstructions?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
  }

  try {
    const existing = await getRequest(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
    }

    if (body.assignPhone?.phoneNumber?.trim()) {
      const phone = body.assignPhone.phoneNumber.trim();
      await assignPhoneNumberToUser(existing.userId, phone, {
        elevenLabsPhoneNumberId: body.assignPhone.elevenLabsPhoneNumberId,
        forwardingInstructions: body.assignPhone.forwardingInstructions,
      });

      const admin = createAdminClient();
      await admin
        .from("requests")
        .update({
          status: "erledigt",
          updated_at: new Date().toISOString(),
          payload: {
            ...existing.payload,
            phoneNumber: phone,
            elevenLabsPhoneNumberId:
              body.assignPhone.elevenLabsPhoneNumberId?.trim() || null,
            forwardingInstructions:
              body.assignPhone.forwardingInstructions?.trim() || null,
            assignedAt: new Date().toISOString(),
          },
        })
        .eq("id", params.id);

      const request = await getRequest(params.id);
      return NextResponse.json({ ok: true, request });
    }

    const isPhoneRequest =
      existing.type === "nummer_beantragen" ||
      existing.type === "nummer_zuweisung";

    if (isPhoneRequest && body.status === "erledigt") {
      return NextResponse.json(
        {
          error:
            "Nummer-Anfragen können nur mit Twilio-Nummer bestätigt werden. Bitte assignPhone.phoneNumber angeben.",
        },
        { status: 400 }
      );
    }

    const request = await updateRequest(params.id, body);
    return NextResponse.json({ ok: true, request });
  } catch (error) {
    console.error("[admin/requests/id]", error);
    return NextResponse.json(
      { error: "Speichern fehlgeschlagen." },
      { status: 500 }
    );
  }
}
