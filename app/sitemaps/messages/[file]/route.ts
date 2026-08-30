import { listPublicMessageRefs } from "@/lib/public-archive";
import { SITE_ORIGIN } from "@/lib/site";
import {
  MESSAGE_SITEMAP_PAGE_SIZE,
  parseMessageSitemapFile,
  serializeUrlSet,
  sitemapHeaders,
} from "@/lib/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageSitemapContext = {
  params: Promise<{ file: string }>;
};

export async function GET(_request: Request, { params }: MessageSitemapContext) {
  const { file } = await params;
  const page = parseMessageSitemapFile(file);
  if (page === null) {
    return new Response("Sitemap not found.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const result = await listPublicMessageRefs(page, MESSAGE_SITEMAP_PAGE_SIZE);
  if (result.status === "not-found") {
    return new Response("Sitemap not found.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (result.status !== "ok") {
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5" },
    });
  }

  const urls = result.value.messages.map(({ id, createdAt }) => ({
    loc: `${SITE_ORIGIN}/messages/${encodeURIComponent(id)}`,
    lastmod: createdAt,
  }));
  return new Response(serializeUrlSet(urls), {
    headers: sitemapHeaders(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    ),
  });
}
