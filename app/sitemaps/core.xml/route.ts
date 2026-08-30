import {
  coreSitemapUrls,
  serializeUrlSet,
  sitemapHeaders,
} from "@/lib/sitemap";

export const dynamic = "force-static";

export function GET() {
  return new Response(serializeUrlSet(coreSitemapUrls()), {
    headers: sitemapHeaders(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    ),
  });
}
