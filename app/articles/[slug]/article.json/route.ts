import { articleJson, findArticle } from "@/lib/articles";
import { apiError } from "@/lib/http";

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const article = findArticle((await params).slug);
  if (!article) return apiError(404, "ERR.ARTICLE_NOT_FOUND", "Article was not found.");

  return Response.json(articleJson(article), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
