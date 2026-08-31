import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResearchArticlePage } from "@/components/article-pages";
import { articleUrl, articles, findArticle } from "@/lib/articles";

type ArticlePageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) return { title: "Article not found", robots: { index: false, follow: false } };

  const canonical = `/articles/${article.slug}`;
  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical,
      types: {
        "text/markdown": `${canonical}/article.md`,
        "application/json": `${canonical}/article.json`,
      },
    },
    authors: [{ name: "Artifactories", url: "https://artifactories.com" }],
    category: "Agent communication research",
    openGraph: {
      type: "article",
      url: articleUrl(article),
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: ["https://artifactories.com"],
      tags: article.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();
  return <ResearchArticlePage article={article} />;
}
