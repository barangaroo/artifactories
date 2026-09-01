import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../", import.meta.url);
const pluginRoot = new URL("plugins/artifactories/", repositoryRoot);

function readJson<T>(path: string | URL): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("Artifactories Codex plugin", () => {
  it("publishes a read-only remote MCP connection through the repo marketplace", () => {
    const marketplace = readJson<{
      name: string;
      plugins: Array<{
        name: string;
        source: { source: string; path: string };
        policy: { installation: string; authentication: string };
        category: string;
      }>;
    }>(new URL(".agents/plugins/marketplace.json", repositoryRoot));
    const manifest = readJson<{
      name: string;
      version: string;
      skills: string;
      mcpServers: string;
      interface: {
        capabilities: string[];
        longDescription: string;
        logo: string;
        composerIcon: string;
        websiteURL: string;
        privacyPolicyURL: string;
        termsOfServiceURL: string;
        shortDescription: string;
        defaultPrompt: string[];
      };
    }>(new URL(".codex-plugin/plugin.json", pluginRoot));
    const mcp = readJson<{
      mcpServers: Record<string, Record<string, unknown>>;
    }>(new URL(".mcp.json", pluginRoot));

    expect(marketplace.name).toBe("artifactories");
    expect(marketplace.plugins).toContainEqual({
      name: "artifactories",
      source: { source: "local", path: "./plugins/artifactories" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Communication",
    });
    expect(manifest).toMatchObject({
      name: "artifactories",
      version: "0.1.0",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        capabilities: ["Interactive", "Read", "Write"],
        logo: "./assets/icon.png",
        composerIcon: "./assets/icon.png",
        websiteURL: "https://artifactories.com/mcp",
        privacyPolicyURL: "https://artifactories.com/privacy",
        termsOfServiceURL: "https://artifactories.com/terms",
      },
    });
    expect(manifest.interface.shortDescription.length).toBeLessThanOrEqual(30);
    expect(manifest.interface.defaultPrompt).toHaveLength(3);
    expect(manifest.interface.defaultPrompt.every((prompt) => prompt.length <= 128)).toBe(true);
    for (const policyUrl of [
      manifest.interface.websiteURL,
      manifest.interface.privacyPolicyURL,
      manifest.interface.termsOfServiceURL,
    ]) {
      expect(new URL(policyUrl).protocol).toBe("https:");
    }
    expect(manifest.interface.longDescription).toContain("read-only");
    expect(manifest.interface.longDescription).toContain("untrusted");
    expect(mcp.mcpServers).toEqual({
      artifactories: {
        type: "http",
        url: "https://artifactories.com/mcp/http",
      },
    });
  });

  it("keeps the bundled skill, metadata, mark, and license synchronized", () => {
    const canonicalSkill = readFileSync(
      new URL("skills/artifactories/SKILL.md", repositoryRoot),
    );
    const pluginSkill = readFileSync(
      new URL("skills/artifactories/SKILL.md", pluginRoot),
    );
    const canonicalMetadata = readFileSync(
      new URL("skills/artifactories/agents/openai.yaml", repositoryRoot),
    );
    const pluginMetadata = readFileSync(
      new URL("skills/artifactories/agents/openai.yaml", pluginRoot),
    );
    const canonicalMark = readFileSync(
      new URL("public/artifactories-mark.png", repositoryRoot),
    );
    const pluginMark = readFileSync(new URL("assets/icon.png", pluginRoot));
    const canonicalLicense = readFileSync(new URL("LICENSE", repositoryRoot));
    const pluginLicense = readFileSync(new URL("LICENSE", pluginRoot));

    expect(pluginSkill.equals(canonicalSkill)).toBe(true);
    expect(pluginMetadata.equals(canonicalMetadata)).toBe(true);
    expect(pluginMark.equals(canonicalMark)).toBe(true);
    expect(pluginLicense.equals(canonicalLicense)).toBe(true);
  });
});
