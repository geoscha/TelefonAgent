import "server-only";

import {
  normalizeWebsiteUrl,
  stripHtmlToText,
} from "@/lib/enrichment/website-context";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES = 10;
const MAX_CHARS_PER_PAGE = 8_000;
const MAX_TOTAL_CHARS = 40_000;

const LINK_KEYWORDS = [
  "leistung",
  "service",
  "angebot",
  "schaden",
  "meldung",
  "formular",
  "kontakt",
  "impressum",
  "team",
  "uber-uns",
  "ueber-uns",
  "about",
  "faq",
  "hilfe",
  "mieter",
  "eigentuemer",
  "eigentümer",
  "verwaltung",
  "notfall",
  "portal",
];

export interface ScrapedPage {
  url: string;
  title: string | null;
  text: string;
}

export interface WebsiteScrapeResult {
  baseUrl: string;
  hostname: string;
  pages: ScrapedPage[];
}

export function validateWebsiteUrl(raw: string): {
  ok: true;
  url: string;
  hostname: string;
} | { ok: false; error: string } {
  const url = normalizeWebsiteUrl(raw);
  if (!url) {
    return { ok: false, error: "Bitte geben Sie eine Website-URL ein." };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Nur http- oder https-URLs sind erlaubt." };
    }
    if (!parsed.hostname || parsed.hostname === "localhost") {
      return { ok: false, error: "Ungültige Website-URL." };
    }
    return { ok: true, url: parsed.toString(), hostname: parsed.hostname };
  } catch {
    return { ok: false, error: "Ungültige Website-URL." };
  }
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

function extractInternalLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const hrefPattern = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== baseUrl.hostname) continue;
      if (!["http:", "https:"].includes(resolved.protocol)) continue;
      resolved.hash = "";
      links.add(resolved.toString());
    } catch {
      /* skip invalid */
    }
  }

  return Array.from(links);
}

function scoreLink(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const keyword of LINK_KEYWORDS) {
    if (lower.includes(keyword)) score += 3;
  }
  if (lower.endsWith(basePathScore(lower))) score += 1;
  return score;
}

function basePathScore(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "LinkerBot/1.0 (+https://linker.app; website-knowledge-sync)",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return null;
    }

    return await res.text();
  } catch {
    return null;
  }
}

function pageFromHtml(url: string, html: string): ScrapedPage | null {
  const title = extractTitle(html);
  const description = extractMetaDescription(html);
  const body = stripHtmlToText(html);
  const parts = [
    title ? `Seitentitel: ${title}` : null,
    description ? `Beschreibung: ${description}` : null,
    body ? body.slice(0, MAX_CHARS_PER_PAGE) : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return {
    url,
    title,
    text: parts.join("\n\n"),
  };
}

/**
 * Crawls the operator website (homepage + relevant internal pages) for KB enrichment.
 */
export async function scrapeOperatorWebsite(
  rawUrl: string
): Promise<WebsiteScrapeResult> {
  const validated = validateWebsiteUrl(rawUrl);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const baseUrl = new URL(validated.url);
  const visited = new Set<string>();
  const pages: ScrapedPage[] = [];
  let totalChars = 0;

  const homepageHtml = await fetchPage(validated.url);
  if (!homepageHtml) {
    throw new Error(
      "Die Website konnte nicht gelesen werden. Bitte prüfen Sie die URL."
    );
  }

  visited.add(validated.url);
  const homepage = pageFromHtml(validated.url, homepageHtml);
  if (homepage) {
    pages.push(homepage);
    totalChars += homepage.text.length;
  }

  const candidates = extractInternalLinks(homepageHtml, baseUrl)
    .filter((link) => !visited.has(link))
    .sort((a, b) => scoreLink(b) - scoreLink(a))
    .slice(0, MAX_PAGES - 1);

  for (const link of candidates) {
    if (pages.length >= MAX_PAGES || totalChars >= MAX_TOTAL_CHARS) break;

    const html = await fetchPage(link);
    if (!html) continue;

    visited.add(link);
    const page = pageFromHtml(link, html);
    if (!page) continue;

    pages.push(page);
    totalChars += page.text.length;
  }

  if (pages.length === 0) {
    throw new Error("Auf der Website wurde kein lesbarer Inhalt gefunden.");
  }

  return {
    baseUrl: validated.url,
    hostname: validated.hostname,
    pages,
  };
}

export function formatScrapedPagesForLlm(result: WebsiteScrapeResult): string {
  return result.pages
    .map(
      (page) =>
        `--- Seite: ${page.url}${page.title ? ` (${page.title})` : ""} ---\n${page.text}`
    )
    .join("\n\n")
    .slice(0, MAX_TOTAL_CHARS);
}
