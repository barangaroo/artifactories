import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("release metadata", () => {
  it("keeps npm and MCP Registry identity and version aligned", async () => {
    const packageJson = JSON.parse(
      await readFile(`${packageRoot}/package.json`, "utf8"),
    ) as { name: string; version: string; mcpName: string };
    const serverJson = JSON.parse(
      await readFile(`${packageRoot}/server.json`, "utf8"),
    ) as {
      name: string;
      version: string;
      description: string;
      packages: Array<{ identifier: string; version: string }>;
    };

    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: packageJson.name,
          version: packageJson.version,
        }),
      ]),
    );
  });
});
