import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleIndexPage, ResearchArticlePage } from "@/components/article-pages";
import { articleJson, articles, articleToMarkdown, findArticle } from "@/lib/articles";
import { GET as getArticleJson } from "@/app/articles/[slug]/article.json/route";

describe("source-backed agent communication articles", () => {
  it("publishes distinct, substantial articles for the requested topics", () => {
    expect(articles.map(({ slug }) => slug)).toEqual([
      "hugging-face-agent-collective-phaseone",
      "moltbook-agent-social-network-lessons",
      "a2a-agent-communication-2026",
    ]);

    for (const article of articles) {
      expect(article.sections.length).toBeGreaterThanOrEqual(6);
      expect(article.sources.length).toBeGreaterThanOrEqual(4);
      expect(article.sections.every(({ sourceIds }) => sourceIds.length > 0)).toBe(true);
      const sourceIds = new Set(article.sources.map(({ id }) => id));
      expect(
        article.sections.flatMap(({ sourceIds }) => sourceIds).every((id) => sourceIds.has(id)),
      ).toBe(true);
    }
  });

  it("renders crawlable HTML with citations and machine alternates", () => {
    const article = findArticle("a2a-agent-communication-2026");
    expect(article).toBeDefined();
    const html = renderToStaticMarkup(
      createElement(ResearchArticlePage, { article: article! }),
    );

    expect(html).toContain("A2A v1.0");
    expect(html).toContain("MCP is adjacent, not interchangeable");
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain(`/articles/${article!.slug}/article.md`);
    expect(html).toContain(`/articles/${article!.slug}/article.json`);
    expect(html).toContain("not an operational instruction");
  });

  it("keeps Markdown and JSON on the same canonical article source", () => {
    for (const article of articles) {
      const markdown = articleToMarkdown(article);
      const json = articleJson(article);
      expect(markdown).toContain(`# ${article.title}`);
      expect(markdown).toContain(
        `canonical_url: https://artifactories.com/articles/${article.slug}`,
      );
      expect(markdown).toContain("## Sources");
      expect(json.canonicalUrl).toBe(`https://artifactories.com/articles/${article.slug}`);
      expect(json.sections).toEqual(article.sections);
    }
  });

  it("links every article from the server-rendered research index", () => {
    const html = renderToStaticMarkup(createElement(ArticleIndexPage));
    for (const article of articles) {
      expect(html).toContain(`/articles/${article.slug}`);
      expect(html).toContain(article.title);
    }
  });

  it("returns the standard JSON error envelope for an unknown article", async () => {
    const response = await getArticleJson(
      new Request("https://artifactories.com/articles/unknown/article.json"),
      { params: Promise.resolve({ slug: "unknown" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ERR.ARTICLE_NOT_FOUND", message: "Article was not found." },
    });
  });
});
