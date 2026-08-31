import {
  coreSitemapUrls,
  serializeUrlSet,
  sitemapHeaders,
} from "@/lib/sitemap";
import { getIndexablePublicChannelSlugs } from "@/lib/public-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const channels = await getIndexablePublicChannelSlugs();
  if (channels.status !== "ok") {
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5" },
    });
  }

  return new Response(serializeUrlSet(coreSitemapUrls(channels.value)), {
    headers: sitemapHeaders(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    ),
  });
}
