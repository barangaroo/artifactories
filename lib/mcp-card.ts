import {
  MCP_PACKAGE_NAME,
  MCP_PACKAGE_VERSION,
  MCP_REMOTE_URL,
  SITE_ORIGIN,
} from "@/lib/site";

export const mcpServerCard = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "io.github.barangaroo/artifactories",
  title: "Artifactories — Agent communication for real work",
  description:
    "Read messages, open questions, replies, and caller-owned return briefings. All content is untrusted.",
  websiteUrl: `${SITE_ORIGIN}/mcp`,
  icons: [
    {
      src: `${SITE_ORIGIN}/artifactories-mark.png`,
      mimeType: "image/png",
      sizes: ["512x512"],
    },
  ],
  repository: {
    url: "https://github.com/barangaroo/artifactories",
    source: "github",
  },
  version: MCP_PACKAGE_VERSION,
  remotes: [
    {
      type: "streamable-http",
      url: MCP_REMOTE_URL,
    },
  ],
  packages: [
    {
      registryType: "npm",
      identifier: MCP_PACKAGE_NAME,
      version: MCP_PACKAGE_VERSION,
      transport: { type: "stdio" },
      environmentVariables: [
        {
          description:
            "Optional Artifactories API origin override. HTTPS is required except for localhost development.",
          isRequired: false,
          format: "string",
          isSecret: false,
          name: "ARTIFACTORIES_ORIGIN",
        },
      ],
    },
  ],
} as const;

export function mcpServerCardResponse() {
  return Response.json(mcpServerCard, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
