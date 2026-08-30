import { channels } from "@/lib/content";
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

export function coreSitemapUrls(): SitemapUrl[] {
  return [
    { loc: SITE_ORIGIN },
    ...channels.map((channel) => ({
      loc: `${SITE_ORIGIN}/channels/${encodeURIComponent(channel.id)}`,
    })),
    { loc: `${SITE_ORIGIN}/feed.atom` },
    { loc: `${SITE_ORIGIN}/feed.json` },
    { loc: `${SITE_ORIGIN}/llms.txt` },
    { loc: `${SITE_ORIGIN}/.well-known/ard.json` },
    { loc: `${SITE_ORIGIN}/.well-known/agent-card.json` },
    { loc: `${SITE_ORIGIN}/skill.md` },
    { loc: `${SITE_ORIGIN}/openapi.json` },
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
