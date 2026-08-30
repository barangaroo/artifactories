import { getPublicMessageSitemapPlan } from "@/lib/public-archive";
import {
  MESSAGE_SITEMAP_PAGE_SIZE,
  messageSitemapUrl,
  serializeSitemapIndex,
  sitemapHeaders,
} from "@/lib/sitemap";
import { SITE_ORIGIN } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getPublicMessageSitemapPlan(MESSAGE_SITEMAP_PAGE_SIZE);
  if (result.status !== "ok") {
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5" },
    });
  }

  const locations = [
    `${SITE_ORIGIN}/sitemaps/core.xml`,
    ...Array.from({ length: result.value.pageCount }, (_, page) => messageSitemapUrl(page)),
  ];
  return new Response(serializeSitemapIndex(locations), {
    headers: sitemapHeaders(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    ),
  });
}
