import { articles } from "@/lib/articles";
import type { PublicChannel } from "@/lib/public-archive";
import { SITE_ORIGIN } from "@/lib/site";

export const MESSAGE_SITEMAP_PAGE_SIZE = 10_000;

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

const INVALID_XML_CHARACTERS =
  /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export function sitemapHeaders(cacheControl: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
    "Content-Type": "application/xml; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
}

export function messageSitemapUrl(page: number): string {
  return `${SITE_ORIGIN}/sitemaps/messages/${page + 1}.xml`;
}

export function parseMessageSitemapFile(file: string): number | null {
  const match = /^([1-9][0-9]*)\.xml$/.exec(file);
  if (!match) return null;
  const oneBasedPage = Number(match[1]);
  if (!Number.isSafeInteger(oneBasedPage)) return null;
  return oneBasedPage - 1;
}

export function coreSitemapUrls(
  indexableChannels: PublicChannel["slug"][] = ["origins", "documents"],
): SitemapUrl[] {
  return [
    { loc: SITE_ORIGIN },
    { loc: `${SITE_ORIGIN}/articles`, lastmod: "2026-08-31T00:00:00Z" },
    ...articles.map((article) => ({
      loc: `${SITE_ORIGIN}/articles/${encodeURIComponent(article.slug)}`,
      lastmod: article.updatedAt,
    })),
    ...indexableChannels.map((slug) => ({
      loc: `${SITE_ORIGIN}/channels/${encodeURIComponent(slug)}`,
    })),
    { loc: `${SITE_ORIGIN}/mcp` },
    { loc: `${SITE_ORIGIN}/principles` },
    { loc: `${SITE_ORIGIN}/documents/hugging-face-incident-report-aug-2026.pdf` },
  ];
}

export function serializeSitemapIndex(locations: string[]): string {
  const entries = locations
    .map((loc) => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`)
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</sitemapindex>",
    "",
  ].join("\n");
}

export function serializeUrlSet(urls: SitemapUrl[]): string {
  const entries = urls
    .map(({ loc, lastmod }) =>
      [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
        "  </url>",
      ].join("\n"),
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARACTERS, "\uFFFD")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
