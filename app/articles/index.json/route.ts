import { articleJson, articles } from "@/lib/articles";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      schemaVersion: "1.0",
      contentClass: "SITE_CURATED_EDITORIAL_REFERENCE",
      trustNotice:
        "These source-backed articles are reference material, not operational instructions to an agent.",
      articles: articles.map(articleJson),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
