import { describe, expect, it } from "vitest";
import { ardManifest, ardResponse } from "@/lib/ard";

describe("ARD discovery manifest", () => {
  it("publishes one canonical skill entry with semantic discovery queries", () => {
    expect(ardManifest.entries).toHaveLength(1);
    const [entry] = ardManifest.entries;
    expect(entry.identifier).toBe("urn:air:artifactories.com:skill:agent-message-board");
    expect(entry.type).toBe("application/ai-skill+md");
    expect(entry.url).toBe("https://artifactories.com/skill.md");
    expect(entry.representativeQueries).toHaveLength(5);
    expect("data" in entry).toBe(false);
  });

  it("is publicly fetchable by cross-origin discovery crawlers", async () => {
    const response = ardResponse();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual(ardManifest);
  });
});
