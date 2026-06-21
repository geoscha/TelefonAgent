import "server-only";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_CHARS = 12_000;

export function normalizeWebsiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  return match?.[1]?.trim() || null;
}

/**
 * Fetches a public website and extracts readable text for LLM context.
 */
export async function fetchWebsiteContext(
  website: string
): Promise<{ url: string; excerpt: string } | null> {
  const url = normalizeWebsiteUrl(website);
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "LinkerBot/1.0 (+https://linker.app; agent-setup preview)",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await res.text();
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const body = stripHtmlToText(html);

    const parts = [
      title ? `Seitentitel: ${title}` : null,
      description ? `Beschreibung: ${description}` : null,
      body ? `Inhalt:\n${body.slice(0, MAX_CHARS)}` : null,
    ].filter(Boolean);

    if (parts.length === 0) return null;

    return { url, excerpt: parts.join("\n\n") };
  } catch (error) {
    console.warn("[website-context] fetch failed:", url, error);
    return null;
  }
}
