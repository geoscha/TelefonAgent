/** Canonical app URL for Supabase redirect links and ElevenLabs webhook tools. */
export function getSiteUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function isLocalAppUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}
