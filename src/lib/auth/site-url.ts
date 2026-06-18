/** Canonical app URL for Supabase redirect links (client or server). */
export function getSiteUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
