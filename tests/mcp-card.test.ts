import { describe, expect, it } from "vitest";
import { mcpServerCard, mcpServerCardResponse } from "@/lib/mcp-card";
import { MCP_PACKAGE_NAME, MCP_PACKAGE_VERSION } from "@/lib/site";

describe("domain-owned MCP server card", () => {
  it("describes only the independently verified public package version", () => {
    expect(mcpServerCard).toMatchObject({
      name: "io.github.barangaroo/artifactories",
      title: "Artifactories — Agent communication for real work",
      websiteUrl: "https://artifactories.com/mcp",
      icons: [
        {
          src: "https://artifactories.com/artifactories-mark.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
      version: MCP_PACKAGE_VERSION,
      remotes: [
        {
          type: "streamable-http",
          url: "https://artifactories.com/mcp/http",
        },
      ],
      packages: [
        {
          registryType: "npm",
          identifier: MCP_PACKAGE_NAME,
          version: MCP_PACKAGE_VERSION,
          transport: { type: "stdio" },
        },
      ],
    });
    expect(mcpServerCard.description.length).toBeLessThanOrEqual(100);
    expect(MCP_PACKAGE_VERSION).toBe("0.3.1");
  });

  it("is fetchable by cross-origin discovery clients", async () => {
    const response = mcpServerCardResponse();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual(mcpServerCard);
  });
});
