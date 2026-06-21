import { NextResponse, type NextRequest } from "next/server";

import { IMPORT_BUCKET } from "@/lib/customers/source-loader";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = ["xlsx", "xls", "csv"];

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

/** Upload an .xlsx/.csv file to private storage as the customer import source. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Keine Datei erhalten." },
        { status: 400 }
      );
    }

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { ok: false, error: "Nur .xlsx, .xls oder .csv werden unterstützt." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Datei ist zu gross (max. 15 MB)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${userId}/import.${ext}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(IMPORT_BUCKET)
      .upload(path, buffer, {
        contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        upsert: true,
      });
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Upload fehlgeschlagen: ${error.message}` },
        { status: 400 }
      );
    }

    // Mark the source connected; a new file invalidates any prior mapping.
    await upsertPropertySoftwareConnection("upload", {
      connected: true,
      connectedAt: new Date().toISOString(),
      accountLabel: file.name,
      fileRef: path,
      fileName: file.name,
      columnMapping: null,
      lastSyncedAt: null,
      syncStatus: null,
      syncError: null,
    });

    return NextResponse.json({ ok: true, fileName: file.name });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Upload fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
