import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GET as getLlmsText } from "@/app/llms.txt/route";
import { McpSetupPage } from "@/components/mcp-setup-page";
import {
  AUTOGEN_EXAMPLE_URL,
  CAMEL_EXAMPLE_URL,
  CLAUDE_MCP_ADD_COMMAND,
  CODEX_MCP_ADD_COMMAND,
  DESIGN_PARTNER_DISCUSSION_URL,
  GOOGLE_ADK_EXAMPLE_URL,
  MICROSOFT_AGENT_FRAMEWORK_EXAMPLE_URL,
  MCP_CLIENT_CONFIG,
  MCP_SERVER_COMMAND,
  MCP_TOOL_NAMES,
} from "@/lib/site";

describe("MCP setup discovery", () => {
  it("renders verified client commands, tools, and the read-only boundary", () => {
    const html = renderToStaticMarkup(createElement(McpSetupPage));

    expect(html).toContain(CODEX_MCP_ADD_COMMAND);
    expect(html).toContain(CLAUDE_MCP_ADD_COMMAND);
    expect(html).toContain(MCP_SERVER_COMMAND);
    expect(html).toContain(MCP_CLIENT_CONFIG.replaceAll('"', "&quot;"));
    expect(MCP_TOOL_NAMES).toHaveLength(4);
    for (const tool of MCP_TOOL_NAMES) expect(html).toContain(tool);
    expect(html).toContain("Reading cannot silently become writing");
    expect(html).toContain("Official MCP Registry entry");
    expect(html).toContain(GOOGLE_ADK_EXAMPLE_URL);
    expect(html).toContain("Google ADK 2.8.0 example");
    expect(html).toContain(MICROSOFT_AGENT_FRAMEWORK_EXAMPLE_URL);
    expect(html).toContain("Microsoft Agent Framework 1.16.0 example");
    expect(html).toContain(AUTOGEN_EXAMPLE_URL);
    expect(html).toContain("AutoGen 0.7.5 example");
    expect(html).toContain(CAMEL_EXAMPLE_URL);
    expect(html).toContain("CAMEL 0.2.90 example");
    expect(html).toContain(DESIGN_PARTNER_DISCUSSION_URL);
    expect(html).toContain("An empty result is valid evidence");
    expect(html).toContain("Join the field study");
    expect(html).toContain('aria-live="polite"');
  });

  it("publishes the setup page and authority boundary in llms.txt", async () => {
    const response = getLlmsText();
    const body = await response.text();

    expect(body).toContain("https://artifactories.com/mcp");
    expect(body).toContain(GOOGLE_ADK_EXAMPLE_URL);
    expect(body).toContain(MICROSOFT_AGENT_FRAMEWORK_EXAMPLE_URL);
    expect(body).toContain(AUTOGEN_EXAMPLE_URL);
    expect(body).toContain(CAMEL_EXAMPLE_URL);
    expect(body).toContain(MCP_SERVER_COMMAND);
    expect(body).toContain("It cannot register, create or store keys, sign, or post.");
    expect(body).toContain(DESIGN_PARTNER_DISCUSSION_URL);
    expect(body).toContain("A genuine read during an existing real workflow can qualify");
  });
});
