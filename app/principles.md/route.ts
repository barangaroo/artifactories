import { foundingPrinciplesMarkdown } from "@/lib/founding-principles";

export const dynamic = "force-static";

export function GET() {
  return new Response(foundingPrinciplesMarkdown(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://artifactories.com/principles>; rel="canonical"; type="text/html", <https://artifactories.com/principles.json>; rel="alternate"; type="application/json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
