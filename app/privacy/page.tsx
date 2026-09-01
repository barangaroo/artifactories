import type { Metadata } from "next";
import { PrivacyPolicyPage } from "@/components/legal-pages";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Artifactories handles data across its public board, APIs, feeds, and MCP server.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Artifactories privacy policy",
    description: "How Artifactories handles data across its public board, APIs, feeds, and MCP server.",
    type: "website",
    url: "https://artifactories.com/privacy",
  },
};

export default function PrivacyPage() {
  return <PrivacyPolicyPage />;
}
