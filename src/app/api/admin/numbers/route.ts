import { NextResponse, type NextRequest } from "next/server";

import {
  getExistingPoolPhoneSet,
  listAdminPoolNumbers,
  parseUniquePoolNumbers,
} from "@/lib/admin/number-pool";
import { requireAdminSession } from "@/lib/admin/guard";
import { listWorkspacePhones, normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { processPendingPhoneAssignments } from "@/lib/phone/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const numbers = await listAdminPoolNumbers();
    const free = numbers.filter((n) => n.status === "frei");
    const used = numbers.filter((n) => n.status === "belegt");
    return NextResponse.json({
      ok: true,
      numbers,
      summary: { total: numbers.length, free: free.length, used: used.length },
    });
  } catch (error) {
    console.error("[admin/numbers]", error);
    return NextResponse.json(
      { error: "Nummern konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { phoneNumber?: string; phoneNumbers?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const raw =
    body.phoneNumbers ??
    (body.phoneNumber ? [body.phoneNumber] : []);
  const flattened = raw.flatMap((n) => n.split(/[\n,;]+/));
  const { unique, duplicateInInput } = parseUniquePoolNumbers(flattened);

  if (unique.length === 0 && duplicateInInput.length === 0) {
    return NextResponse.json(
      { error: "Bitte mindestens eine Nummer angeben." },
      { status: 400 }
    );
  }

  try {
    const existing = await getExistingPoolPhoneSet();
    const poolList = await listAdminPoolNumbers();
    const statusByPhone = new Map(
      poolList.map((n) => [normalizePhoneNumber(n.phoneNumber), n.status])
    );

    const added: string[] = [];
    const skipped: {
      phone: string;
      reason: "duplicate_input" | "already_free" | "already_used";
    }[] = [];

    for (const phone of duplicateInInput) {
      skipped.push({ phone, reason: "duplicate_input" });
    }

    for (const phone of unique) {
      if (existing.has(phone)) {
        const status = statusByPhone.get(phone);
        skipped.push({
          phone,
          reason: status === "belegt" ? "already_used" : "already_free",
        });
        continue;
      }

      added.push(phone);
    }

    if (added.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Alle Nummern sind bereits im Pool (frei oder belegt).",
        added: [],
        skipped,
      }, { status: 409 });
    }

    const admin = createAdminClient();
    let workspace: Awaited<ReturnType<typeof listWorkspacePhones>> = [];
    try {
      workspace = await listWorkspacePhones();
    } catch (err) {
      console.warn("[admin/numbers] ElevenLabs lookup skipped:", err);
    }

    const inserted: string[] = [];
    for (const phone of added) {
      const match = workspace.find((w) => w.phoneNumber === phone);
      const { error } = await admin.from("forwarding_number_pool").insert({
        phone_number: phone,
        elevenlabs_phone_number_id: match?.phoneNumberId ?? phone,
      });
      if (error) {
        if (error.code === "23505") {
          skipped.push({ phone, reason: "already_free" });
          continue;
        }
        throw error;
      }
      inserted.push(phone);
    }

    const assignedCount =
      inserted.length > 0 ? await processPendingPhoneAssignments() : 0;

    return NextResponse.json({
      ok: true,
      added: inserted,
      skipped,
      assignedCount,
    });
  } catch (error) {
    console.error("[admin/numbers POST]", error);
    return NextResponse.json(
      { error: "Nummern konnten nicht hinzugefügt werden." },
      { status: 500 }
    );
  }
}
