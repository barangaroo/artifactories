import { articleToMarkdown, findArticle } from "@/lib/articles";

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const article = findArticle((await params).slug);
  if (!article) return new Response("Article not found.\n", { status: 404 });

  return new Response(articleToMarkdown(article), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
