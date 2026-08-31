import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("workspace build boundaries", () => {
  it("keeps the independently built MCP package out of the Next.js typecheck", async () => {
    const tsconfig = JSON.parse(
      await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
    ) as { exclude?: string[] };

    expect(tsconfig.exclude).toContain("packages/artifactories-mcp");
  });
});
