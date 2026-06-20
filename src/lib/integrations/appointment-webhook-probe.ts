import "server-only";

import { getSiteUrl, isLocalAppUrl } from "@/lib/auth/site-url";

function localDevWebhookBase(): string {
  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

function appointmentWebhookUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/agent-tools/appointment`;
}

async function pingWebhook(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return data?.ok === true;
  } catch {
    return false;
  }
}

export interface WebhookProbeResult {
  ok: boolean;
  message: string;
  testedUrl?: string;
}

/** Checks that ElevenLabs can reach the appointment tool webhook. */
export async function probeAppointmentWebhook(
  publicUrl: string
): Promise<WebhookProbeResult> {
  const testedUrl = appointmentWebhookUrl(publicUrl);

  if (await pingWebhook(testedUrl, 8_000)) {
    return { ok: true, message: "Webhook erreichbar.", testedUrl };
  }

  const localUrl = appointmentWebhookUrl(localDevWebhookBase());
  const localRunning = await pingWebhook(localUrl, 3_000);
  const configured = publicUrl.replace(/\/$/, "");

  if (localRunning) {
    if (isLocalAppUrl(configured)) {
      return {
        ok: false,
        message:
          "Termin-Tools benötigen eine öffentliche URL. Setze NEXT_PUBLIC_APP_URL auf einen laufenden Tunnel (cloudflared tunnel --url http://localhost:3000) oder nutze Vercel — localhost reicht für ElevenLabs nicht.",
        testedUrl,
      };
    }

    if (/trycloudflare\.com/i.test(configured)) {
      return {
        ok: false,
        message: `Die Cloudflare-Tunnel-URL in NEXT_PUBLIC_APP_URL ist abgelaufen (${configured}). Neuen Tunnel starten: cloudflared tunnel --url http://localhost:3000 — neue URL in .env.local eintragen — npm run dev neu starten. Oder die App direkt über die neue Tunnel-URL öffnen (nicht localhost).`,
        testedUrl,
      };
    }

    return {
      ok: false,
      message: `NEXT_PUBLIC_APP_URL (${configured}) ist von aussen nicht erreichbar, der lokale Server läuft aber. Bitte Tunnel/Vercel-URL prüfen und npm run dev neu starten.`,
      testedUrl,
    };
  }

  return {
    ok: false,
    message:
      "Weder öffentlicher Webhook noch lokaler Dev-Server erreichbar. Bitte npm run dev starten und NEXT_PUBLIC_APP_URL auf einen laufenden Tunnel oder Vercel setzen.",
    testedUrl,
  };
}

/** Prefer the live request host (tunnel/Vercel) over a stale env URL. */
export function resolveAppointmentWebhookBaseUrl(req: {
  headers: Headers;
}): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? "http")
    .split(",")[0]
    .trim();

  if (
    host &&
    !/^localhost(:\d+)?$/i.test(host) &&
    !/^127\.0\.0\.1(:\d+)?$/i.test(host)
  ) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return getSiteUrl();
}
