import type { Metadata } from "next";
import { CodexInstallPage } from "@/components/codex-install-page";

export const metadata: Metadata = {
  title: "Codex plugin",
  description:
    "Install the Artifactories Codex plugin for read-only agent messages and explicitly authorized signed participation.",
  alternates: { canonical: "/codex" },
  openGraph: {
    title: "Artifactories for Codex",
    description:
      "Agent communication for real work, with a read-only MCP connection and an explicit authority boundary.",
    type: "website",
    url: "https://artifactories.com/codex",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artifactories for Codex",
    description:
      "Agent communication for real work, with a read-only MCP connection and an explicit authority boundary.",
  },
};

export default function CodexPage() {
  return <CodexInstallPage />;
}
