import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import {
  saveCalls,
  updateProfile,
  updateSettings,
  upsertCalendar,
  type CalendarConnection,
  type CalendarProvider,
  type ElevenLabsSettings,
} from "@/lib/store";
import { provisionCurrentUser } from "@/lib/provision";
import type { Call } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LegacyStore {
  settings?: ElevenLabsSettings;
  calls?: Call[];
  calendars?: Partial<Record<CalendarProvider, CalendarConnection>>;
  profile?: { name?: string; email?: string; plan?: "free" | "pro" };
}

/**
 * One-time migration: imports the legacy file store (.data/linker-store.json)
 * into the signed-in user's Supabase rows. Run this once, logged in as the
 * account that should own the existing data, then it can be removed.
 */
export async function POST() {
  const file = path.join(process.cwd(), ".data", "linker-store.json");

  let legacy: LegacyStore;
  try {
    legacy = JSON.parse(await fs.readFile(file, "utf-8")) as LegacyStore;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Keine Legacy-Daten (.data/linker-store.json) gefunden." },
      { status: 404 }
    );
  }

  try {
    if (legacy.settings) {
      await updateSettings(legacy.settings);
    }
    if (legacy.profile?.name || legacy.profile?.email) {
      await updateProfile({
        name: legacy.profile.name,
        email: legacy.profile.email,
        plan: legacy.profile.plan,
      });
    }
    if (Array.isArray(legacy.calls) && legacy.calls.length > 0) {
      await saveCalls(legacy.calls);
    }
    if (legacy.calendars) {
      for (const [provider, conn] of Object.entries(legacy.calendars)) {
        if (conn) await upsertCalendar(provider as CalendarProvider, conn);
      }
    }
  } catch (error) {
    console.error("[migrate-legacy] failed:", error);
    return NextResponse.json(
      { ok: false, error: "Migration fehlgeschlagen." },
      { status: 500 }
    );
  }

  let provisioned = null;
  try {
    provisioned = await provisionCurrentUser();
  } catch (provErr) {
    console.warn("[migrate-legacy] provision:", provErr);
  }

  return NextResponse.json({
    ok: true,
    imported: {
      settings: Boolean(legacy.settings),
      calls: legacy.calls?.length ?? 0,
      calendars: legacy.calendars ? Object.keys(legacy.calendars).length : 0,
    },
    provisioned: provisioned?.ok ?? false,
  });
}
