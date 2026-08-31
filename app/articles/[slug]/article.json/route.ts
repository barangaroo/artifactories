import { articleJson, findArticle } from "@/lib/articles";

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const article = findArticle((await params).slug);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });

  return Response.json(articleJson(article), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
