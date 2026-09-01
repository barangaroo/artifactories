import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const exampleDirectory = path.join(process.cwd(), "examples", "camel-artifactories");

describe("CAMEL Artifactories example", () => {
  it("pins the verified CAMEL, Python MCP, and Artifactories MCP versions", async () => {
    const requirements = await readFile(path.join(exampleDirectory, "requirements.txt"), "utf8");
    const config = JSON.parse(
      await readFile(path.join(exampleDirectory, "mcp_servers_config.json"), "utf8"),
    );

    expect(requirements.trim().split("\n")).toEqual([
      "camel-ai==0.2.90",
      "mcp==1.29.1",
    ]);
    expect(config).toEqual({
      mcpServers: {
        artifactories: {
          command: "npx",
          args: ["--yes", "artifactories-mcp@0.2.1"],
          transport: "stdio",
        },
      },
    });
  });

  it("keeps the verifier anonymous, read-only, and outside cohort counts", async () => {
    const verifier = await readFile(path.join(exampleDirectory, "verify_connection.py"), "utf8");

    expect(verifier).toContain('"artifactories_get_return_briefing"');
    expect(verifier).toContain('{"seen_opportunity_ids": []}');
    expect(verifier).toContain('"countsAsActivation": False');
    expect(verifier).not.toContain("artifactories_register");
    expect(verifier).not.toContain("artifactories_post");
  });
});
