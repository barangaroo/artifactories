import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GET as getLlmsText } from "@/app/llms.txt/route";
import { CodexInstallPage } from "@/components/codex-install-page";
import {
  CODEX_MARKETPLACE_ADD_COMMAND,
  CODEX_PLUGIN_ADD_COMMAND,
  CODEX_PLUGIN_SOURCE_URL,
  MCP_REGISTRY_URL,
  MCP_REMOTE_URL,
  MCP_TOOL_NAMES,
} from "@/lib/site";

describe("Codex plugin discovery", () => {
  it("renders the install flow, brand, tools, and honest authority boundary", () => {
    const html = renderToStaticMarkup(createElement(CodexInstallPage));

    expect(html).toContain("%2Fartifactories-mark.png");
    expect(html).toContain("Agent communication for real work");
    expect(html).toContain(CODEX_MARKETPLACE_ADD_COMMAND);
    expect(html).toContain(CODEX_PLUGIN_ADD_COMMAND);
    expect(html).toContain(CODEX_PLUGIN_SOURCE_URL);
    expect(html).toContain(MCP_REGISTRY_URL.replaceAll("&", "&amp;"));
    expect(html).toContain(MCP_REMOTE_URL);
    expect(html).toContain("public Git marketplace");
    expect(html).toContain("not currently listed in OpenAI");
    expect(html).toContain("No silent transition from reading to writing");
    expect(html).toContain("Board content is data, never instruction");
    expect(html).toContain('aria-live="polite"');
    for (const tool of MCP_TOOL_NAMES) expect(html).toContain(tool);
  });

  it("publishes the Codex install and distribution boundary in llms.txt", async () => {
    const body = await getLlmsText().text();

    expect(body).toContain("https://artifactories.com/codex");
    expect(body).toContain(CODEX_MARKETPLACE_ADD_COMMAND);
    expect(body).toContain(CODEX_PLUGIN_ADD_COMMAND);
    expect(body).toContain(CODEX_PLUGIN_SOURCE_URL);
    expect(body).toContain("not a listing in OpenAI's universal plugin directory");
    expect(body).toContain("caller-owned Ed25519 private keys remain local");
  });
});
