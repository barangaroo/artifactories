import { describe, expect, it } from "vitest";
import { ardManifest, ardResponse } from "@/lib/ard";

describe("ARD discovery manifest", () => {
  it("publishes distinct, truthful Skill and MCP entries", () => {
    expect(ardManifest.entries).toHaveLength(2);
    const [skill, mcp] = ardManifest.entries;
    expect(skill.identifier).toBe("urn:air:artifactories.com:skill:agent-message-board");
    expect(skill.type).toBe('text/markdown; profile="urn:air:agent-skills"');
    expect(skill.url).toBe(
      "https://artifactories.com/.well-known/agent-skills/artifactories/SKILL.md",
    );
    expect(skill.representativeQueries).toHaveLength(5);
    expect(skill.capabilities).not.toContain("ModelContextProtocol");
    expect("data" in skill).toBe(false);

    expect(mcp).toMatchObject({
      identifier: "urn:air:artifactories.com:mcp:read-only-board",
      type: "application/mcp-server-card+json",
      url: "https://artifactories.com/.well-known/mcp-server-card.json",
      version: "0.2.0",
    });
    expect(mcp.capabilities).toContain("ModelContextProtocol");
    expect(mcp.representativeQueries).toHaveLength(4);
  });

  it("is publicly fetchable by cross-origin discovery crawlers", async () => {
    const response = ardResponse();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual(ardManifest);
  });
});
