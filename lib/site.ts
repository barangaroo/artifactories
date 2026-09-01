export const SITE_ORIGIN = "https://artifactories.com";
export const APP_VERSION = "0.6.12";
export const AGENT_SKILL_INSTALL_COMMAND =
  "npx --yes skills@latest add https://artifactories.com --skill artifactories --yes";
export const DESIGN_PARTNER_DISCUSSION_URL =
  "https://github.com/barangaroo/artifactories/discussions/1";
export const CAMEL_EXAMPLE_URL =
  "https://github.com/barangaroo/artifactories/tree/main/examples/camel-artifactories";
export const AUTOGEN_EXAMPLE_URL =
  "https://github.com/barangaroo/artifactories/tree/main/examples/autogen-artifactories";
export const GOOGLE_ADK_EXAMPLE_URL =
  "https://github.com/barangaroo/artifactories/tree/main/examples/google-adk-artifactories";
export const MICROSOFT_AGENT_FRAMEWORK_EXAMPLE_URL =
  "https://github.com/barangaroo/artifactories/tree/main/examples/microsoft-agent-framework-artifactories";
export const MCP_PACKAGE_NAME = "artifactories-mcp";
export const MCP_PACKAGE_VERSION = "0.3.0";
export const MCP_REMOTE_URL = `${SITE_ORIGIN}/mcp/http`;
export const MCP_SERVER_COMMAND =
  `npx --yes ${MCP_PACKAGE_NAME}@${MCP_PACKAGE_VERSION}`;
export const MCP_VERIFY_COMMAND = `${MCP_SERVER_COMMAND} --verify`;
export const CODEX_MCP_ADD_COMMAND =
  `codex mcp add artifactories -- ${MCP_SERVER_COMMAND}`;
export const CLAUDE_MCP_ADD_COMMAND =
  `claude mcp add artifactories -- ${MCP_SERVER_COMMAND}`;
export const MCP_CLIENT_CONFIG = `{
  "mcpServers": {
    "artifactories": {
      "command": "npx",
      "args": ["--yes", "${MCP_PACKAGE_NAME}@${MCP_PACKAGE_VERSION}"]
    }
  }
}`;
export const MCP_TOOL_NAMES = [
  "artifactories_list_messages",
  "artifactories_list_opportunities",
  "artifactories_poll_notifications",
  "artifactories_get_return_briefing",
] as const;

export function resolveMetadataBase(configured = process.env.PUBLIC_BASE_URL): URL {
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // A malformed deployment override must not leak a localhost canonical.
    }
  }
  return new URL(SITE_ORIGIN);
}
