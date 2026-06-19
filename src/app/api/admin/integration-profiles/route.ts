import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  createElevenLabsAccount,
  createTwilioAccount,
  deleteElevenLabsAccount,
  deleteTwilioAccount,
  listElevenLabsAccountsPublic,
  listTwilioAccountsPublic,
  setDefaultElevenLabsAccount,
  setDefaultTwilioAccount,
  updateTwilioAccount,
} from "@/lib/admin/integration-profiles";
import { TWILIO_COUNTRY_OPTIONS } from "@/lib/integrations/twilio-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const [twilio, elevenlabs] = await Promise.all([
    listTwilioAccountsPublic(),
    listElevenLabsAccountsPublic(),
  ]);

  return NextResponse.json({
    ok: true,
    twilio,
    elevenlabs,
    countries: TWILIO_COUNTRY_OPTIONS,
  });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    type?: "twilio" | "elevenlabs";
    label?: string;
    accountSid?: string;
    authToken?: string;
    apiKey?: string;
    isDefault?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    if (body.type === "twilio") {
      const accountSid = (
        body.accountSid ??
        (body as { account_sid?: string }).account_sid ??
        (body as { sid?: string }).sid ??
        ""
      ).trim();
      const authToken = (
        body.authToken ??
        (body as { auth_token?: string }).auth_token ??
        (body as { token?: string }).token ??
        ""
      ).trim();

      const account = await createTwilioAccount({
        label: body.label ?? "",
        accountSid,
        authToken,
        isDefault: body.isDefault,
      });
      return NextResponse.json({ ok: true, account });
    }

    if (body.type === "elevenlabs") {
      const account = await createElevenLabsAccount({
        label: body.label ?? "",
        apiKey: body.apiKey ?? "",
        isDefault: body.isDefault,
      });
      return NextResponse.json({ ok: true, account });
    }

    return NextResponse.json({ error: "Ungültiger Typ." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: {
    type?: "twilio" | "elevenlabs";
    id?: string;
    action?: "set_default" | "update";
    label?: string;
    accountSid?: string;
    authToken?: string;
    account_sid?: string;
    auth_token?: string;
    sid?: string;
    token?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    if (body.type === "twilio" && body.action === "update") {
      const accountSid = (
        body.accountSid ??
        body.account_sid ??
        body.sid
      )?.trim();
      const authToken = (
        body.authToken ??
        body.auth_token ??
        body.token
      )?.trim();

      const account = await updateTwilioAccount({
        id: body.id,
        label: body.label?.trim(),
        accountSid,
        authToken,
      });
      return NextResponse.json({ ok: true, account });
    }

    if (body.action !== "set_default") {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    if (body.type === "twilio") {
      await setDefaultTwilioAccount(body.id);
    } else if (body.type === "elevenlabs") {
      await setDefaultElevenLabsAccount(body.id);
    } else {
      return NextResponse.json({ error: "Ungültiger Typ." }, { status: 400 });
    }

    const [twilio, elevenlabs] = await Promise.all([
      listTwilioAccountsPublic(),
      listElevenLabsAccountsPublic(),
    ]);

    return NextResponse.json({ ok: true, twilio, elevenlabs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aktualisierung fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!id || (type !== "twilio" && type !== "elevenlabs")) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    if (type === "twilio") {
      await deleteTwilioAccount(id);
    } else {
      await deleteElevenLabsAccount(id);
    }

    const [twilio, elevenlabs] = await Promise.all([
      listTwilioAccountsPublic(),
      listElevenLabsAccountsPublic(),
    ]);

    return NextResponse.json({ ok: true, twilio, elevenlabs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
