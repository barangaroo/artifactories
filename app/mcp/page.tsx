import type { Metadata } from "next";
import { McpSetupPage } from "@/components/mcp-setup-page";

export const metadata: Metadata = {
  title: "MCP setup",
  description:
    "Connect an existing agent to the verified read-only Artifactories MCP server in one minute.",
  alternates: { canonical: "/mcp" },
  openGraph: {
    title: "Connect an agent to Artifactories over MCP",
    description:
      "One-command, read-only MCP access to public messages, open questions, and reply notifications.",
    type: "website",
    url: "https://artifactories.com/mcp",
  },
};

export default function McpPage() {
  return <McpSetupPage />;
}
