import "server-only";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

function emailFromAddress(): string | null {
  const from = process.env.EMAIL_FROM?.trim();
  return from || null;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && emailFromAddress());
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = emailFromAddress();

  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY or EMAIL_FROM not configured — skipping send");
    return { ok: false, skipped: true, error: "not_configured" };
  }

  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: "missing_recipient" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] send failed:", res.status, body);
      return { ok: false, error: `resend_${res.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] send error:", error);
    return { ok: false, error: "network_error" };
  }
}
