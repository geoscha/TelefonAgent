#!/usr/bin/env node
/**
 * Local Apple CalDAV debug — run from project root:
 *   node --env-file=.env.local scripts/debug-apple-calendar.mjs
 *   node --env-file=.env.local scripts/debug-apple-calendar.mjs --book
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const book = process.argv.includes("--book");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key);

function authHeader(appleId, appPassword) {
  const normalized = appPassword.replace(/[\s-]/g, "");
  return "Basic " + Buffer.from(`${appleId}:${normalized}`).toString("base64");
}

async function propfind(targetUrl, auth, depth, body) {
  const res = await fetch(targetUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

function absolutize(href, base) {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, base.endsWith("/") ? base : `${base}/`).toString();
}

const CAL_LIST = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <prop><resourcetype/><c:supported-calendar-component-set/><displayname/><current-user-privilege-set/></prop>
</propfind>`;

function discoverFromListXml(listXml, homeUrl) {
  const homePath = new URL(homeUrl).pathname.replace(/\/$/, "");
  const candidates = [];
  for (const block of listXml.split(/<\/?(?:[A-Za-z0-9]+:)?response>/i)) {
    if (!/VEVENT/i.test(block)) continue;
    const href = block
      .match(/<(?:[A-Za-z0-9]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i)?.[1]
      ?.trim();
    if (!href) continue;
    const path = (/^https?:\/\//i.test(href) ? new URL(href).pathname : href).replace(
      /\/$/,
      ""
    );
    if (path === homePath) continue;
    if (!/\/calendars\/[^/]+$/i.test(path)) continue;
    if (/inbox|outbox|notification/i.test(href)) continue;
    const name = block
      .match(/<(?:[A-Za-z0-9]+:)?displayname[^>]*>([^<]*)<\/(?:[A-Za-z0-9]+:)?displayname>/i)?.[1];
    const score = /\/home\/?$/i.test(href) || /privat/i.test(name ?? "") ? 0 : 2;
    candidates.push({ url: absolutize(href, homeUrl), name, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

async function main() {
  const { data: row, error } = await admin
    .from("calendars")
    .select("*")
    .eq("provider", "apple")
    .eq("connected", true)
    .maybeSingle();

  if (error || !row) {
    console.error("No connected Apple calendar in DB.", error?.message);
    process.exit(1);
  }

  const auth = authHeader(row.account_label, row.app_password);
  console.log("Account:", row.account_label);
  console.log("Stored URL:", row.caldav_calendar_url);

  const homeUrl = row.caldav_calendar_url.endsWith("/calendars/")
    ? row.caldav_calendar_url
    : row.caldav_calendar_url.replace(/\/[^/]+\/?$/, "/");

  const list = await propfind(homeUrl, auth, "1", CAL_LIST);
  console.log("PROPFIND status:", list.status);
  const candidates = discoverFromListXml(list.text, homeUrl);
  console.log("Writable calendars:");
  for (const cal of candidates) {
    console.log(`  - ${cal.name ?? "(ohne Name)"} → ${cal.url}`);
  }

  const target = candidates[0];
  if (!target) {
    console.error("No writable calendar collection found.");
    process.exit(1);
  }

  console.log("\nSelected:", target.url);

  if (row.caldav_calendar_url !== target.url) {
    await admin
      .from("calendars")
      .update({ caldav_calendar_url: target.url })
      .eq("user_id", row.user_id)
      .eq("provider", "apple");
    console.log("Updated stored caldav_calendar_url in DB.");
  }

  if (!book) {
    console.log("\nDry run only. Pass --book to create a test event.");
    return;
  }

  const uid = randomUUID();
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Linker//Debug//DE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    "DTSTART:20260623T080000Z",
    "DTEND:20260623T081500Z",
    "SUMMARY:Linker Debug Termin",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const eventUrl = `${target.url.endsWith("/") ? target.url : `${target.url}/`}${uid}.ics`;
  const putRes = await fetch(eventUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*",
    },
    body: ics,
  });
  console.log("\nPUT", eventUrl);
  console.log("Status:", putRes.status, (await putRes.text()).slice(0, 200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
