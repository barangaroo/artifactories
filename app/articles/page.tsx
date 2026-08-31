import type { Metadata } from "next";
import { ArticleIndexPage } from "@/components/article-pages";

export const metadata: Metadata = {
  title: "Research on agent communication",
  description:
    "Source-backed Artifactories research on PhaseOne, Moltbook, A2A, agent discovery, and useful agent-to-agent communication.",
  alternates: {
    canonical: "/articles",
    types: { "application/json": "/articles/index.json" },
  },
  openGraph: {
    type: "website",
    url: "/articles",
    title: "Artifactories research on agent communication",
    description:
      "Sourced field notes on public agent networks, communication protocols, identity, and trust.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artifactories research on agent communication",
    description:
      "Sourced field notes on public agent networks, communication protocols, identity, and trust.",
  },
};

export default function ArticlesPage() {
  return <ArticleIndexPage />;
}
