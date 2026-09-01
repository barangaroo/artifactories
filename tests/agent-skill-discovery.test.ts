import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canonicalSkill = readFileSync(
  new URL("../skills/artifactories/SKILL.md", import.meta.url),
);
const publicSkill = readFileSync(
  new URL(
    "../public/.well-known/agent-skills/artifactories/SKILL.md",
    import.meta.url,
  ),
);
const githubSkill = readFileSync(
  new URL("../.github/skills/artifactories/SKILL.md", import.meta.url),
);
const skillIndex = JSON.parse(
  readFileSync(
    new URL("../public/.well-known/agent-skills/index.json", import.meta.url),
    "utf8",
  ),
) as {
  $schema: string;
  skills: Array<{
    name: string;
    type: string;
    description: string;
    url: string;
    digest: string;
  }>;
};
const apisJson = JSON.parse(
  readFileSync(new URL("../public/apis.json", import.meta.url), "utf8"),
) as {
  specificationVersion: string;
  apis: Array<{ properties: Array<{ type: string; url: string }> }>;
};

describe("domain-owned agent discovery", () => {
  it("publishes an exact digest-pinned mirror of the canonical Agent Skill", () => {
    expect(publicSkill.equals(canonicalSkill)).toBe(true);
    expect(githubSkill.equals(canonicalSkill)).toBe(true);

    expect(skillIndex.$schema).toBe(
      "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    );
    expect(skillIndex.skills).toHaveLength(1);

    const [entry] = skillIndex.skills;
    expect(entry).toMatchObject({
      name: "artifactories",
      type: "skill-md",
      url: "./artifactories/SKILL.md",
    });
    expect(
      new URL(
        entry.url,
        "https://artifactories.com/.well-known/agent-skills/index.json",
      ).toString(),
    ).toBe(
      "https://artifactories.com/.well-known/agent-skills/artifactories/SKILL.md",
    );
    expect(entry.digest).toBe(
      `sha256:${createHash("sha256").update(publicSkill).digest("hex")}`,
    );

    const description = canonicalSkill
      .toString("utf8")
      .match(/^description: (.+)$/m)?.[1];
    expect(entry.description).toBe(description);
    expect(canonicalSkill.toString("utf8")).toContain("## Return during real work");
    expect(canonicalSkill.toString("utf8")).toContain("must never produce filler");
  });

  it("publishes a truthful APIs.json index with the verified MCP listing", () => {
    expect(apisJson.specificationVersion).toBe("0.23");
    expect(apisJson.apis).toHaveLength(1);

    const propertyTypes = apisJson.apis[0].properties.map(({ type }) => type);
    expect(propertyTypes).toEqual(
      expect.arrayContaining([
        "OpenAPI",
        "LLMsTxt",
        "AgentSkill",
        "AgenticAccess",
        "MCPServer",
        "MCPServerCard",
        "WellKnown",
        "GitHubRepository",
        "X-ResearchIndex",
        "X-License",
      ]),
    );
    expect(propertyTypes).not.toEqual(
      expect.arrayContaining(["ModelContextProtocol", "A2A", "AgentCard"]),
    );
    expect(apisJson.apis[0].properties).toContainEqual(
      expect.objectContaining({
        type: "MCPServer",
        url: "https://artifactories.com/mcp/http",
      }),
    );
  });
});
