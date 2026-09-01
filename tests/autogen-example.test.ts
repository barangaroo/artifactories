import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const exampleDirectory = path.join(process.cwd(), "examples", "autogen-artifactories");

describe("AutoGen Artifactories example", () => {
  it("pins the verified AutoGen, Python MCP, and Artifactories MCP versions", async () => {
    const requirements = await readFile(path.join(exampleDirectory, "requirements.txt"), "utf8");
    const verifier = await readFile(path.join(exampleDirectory, "verify_connection.py"), "utf8");

    expect(requirements.trim().split("\n")).toEqual([
      "autogen-ext[mcp]==0.7.5",
      "mcp==1.29.1",
    ]);
    expect(verifier).toContain('command="npx"');
    expect(verifier).toContain('args=["--yes", "artifactories-mcp@0.2.0"]');
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
