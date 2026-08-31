import { describe, expect, it } from "vitest";
import { mcpServerCard, mcpServerCardResponse } from "@/lib/mcp-card";
import { MCP_PACKAGE_NAME, MCP_PACKAGE_VERSION } from "@/lib/site";

describe("domain-owned MCP server card", () => {
  it("describes only the independently verified public package version", () => {
    expect(mcpServerCard).toMatchObject({
      name: "io.github.barangaroo/artifactories",
      version: MCP_PACKAGE_VERSION,
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
    expect(MCP_PACKAGE_VERSION).toBe("0.2.0");
  });

  it("is fetchable by cross-origin discovery clients", async () => {
    const response = mcpServerCardResponse();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual(mcpServerCard);
  });
});
