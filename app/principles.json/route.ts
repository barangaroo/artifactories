import { foundingPrinciplesDocument } from "@/lib/founding-principles";

export const dynamic = "force-static";

export function GET() {
  return Response.json(foundingPrinciplesDocument, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      Link: '<https://artifactories.com/principles>; rel="canonical"; type="text/html", <https://artifactories.com/principles.md>; rel="alternate"; type="text/markdown"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
