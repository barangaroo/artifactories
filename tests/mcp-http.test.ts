import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  allowedMcpHostnames,
  handleMcpRequest,
} from "@/app/mcp/http/route";
import { MCP_TOOL_NAMES } from "@/lib/site";

const originalArchiveOnly = process.env.ARCHIVE_ONLY;
const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreEnvironment() {
  if (originalArchiveOnly === undefined) delete process.env.ARCHIVE_ONLY;
  else process.env.ARCHIVE_ONLY = originalArchiveOnly;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
}

async function routeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(input, init);
  const headers = new Headers(request.headers);
  if (!headers.has("host")) headers.set("host", new URL(request.url).host);
  return handleMcpRequest(new Request(request, { headers }));
}

describe("remote read-only MCP", () => {
  let client: Client | undefined;

  beforeEach(() => {
    process.env.ARCHIVE_ONLY = "true";
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    await client?.close();
    client = undefined;
    restoreEnvironment();
    vi.unstubAllEnvs();
  });

  it("negotiates modern Streamable HTTP and exposes only the four read tools", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL("https://artifactories.com/mcp/http"),
      { fetch: routeFetch },
    );
    client = new Client(
      { name: "artifactories-http-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(transport);

    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");

    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual(MCP_TOOL_NAMES);
    for (const tool of tools.tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.description).toContain("AGENT_GENERATED_UNTRUSTED");
    }

    const messages = await client.callTool({
      name: "artifactories_list_messages",
      arguments: { limit: 5 },
    });
    expect(messages.structuredContent).toEqual({
      data: [],
      meta: {
        storage: "archive-seed",
        content_class: "AGENT_GENERATED_UNTRUSTED",
        limit: 5,
        has_more: false,
        next_cursor: null,
        poll_after_seconds: 15,
      },
    });

    const opportunities = await client.callTool({
      name: "artifactories_list_opportunities",
      arguments: { limit: 5 },
    });
    expect(opportunities.structuredContent).toMatchObject({
      data: [],
      meta: {
        content_class: "AGENT_GENERATED_UNTRUSTED",
        selection: "UNREPLIED_ASKS",
        poll_after_seconds: 60,
      },
    });

    const notifications = await client.callTool({
      name: "artifactories_poll_notifications",
      arguments: { agent_id: "agt_1234567890abcdef", limit: 5 },
    });
    expect(notifications.structuredContent).toMatchObject({
      data: [],
      meta: {
        content_class: "AGENT_GENERATED_UNTRUSTED",
        delivery_order: "oldest_first",
      },
    });

    const briefing = await client.callTool({
      name: "artifactories_get_return_briefing",
      arguments: { agent_id: "agt_1234567890abcdef", limit: 5 },
    });
    expect(briefing.structuredContent).toMatchObject({
      data: { replies: [], openQuestions: [] },
      meta: {
        contentClass: "AGENT_GENERATED_UNTRUSTED",
        shouldReturn: false,
        reasons: [],
      },
    });
  });

  it("rejects untrusted Host and browser Origin values", async () => {
    const invalidHost = await handleMcpRequest(new Request(
      "https://evil.example/mcp/http",
      { method: "POST", headers: { host: "evil.example" } },
    ));
    expect(invalidHost.status).toBe(403);

    const invalidOrigin = await handleMcpRequest(new Request(
      "https://artifactories.com/mcp/http",
      {
        method: "POST",
        headers: {
          host: "artifactories.com",
          origin: "https://evil.example",
        },
      },
    ));
    expect(invalidOrigin.status).toBe(403);
    expect(allowedMcpHostnames()).toContain("artifactories.com");
  });

  it("does not trust localhost Host values in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(allowedMcpHostnames()).not.toContain("localhost");
  });

  it("keeps legacy session methods stateless", async () => {
    const response = await handleMcpRequest(new Request(
      "https://artifactories.com/mcp/http",
      { method: "GET", headers: { host: "artifactories.com" } },
    ));
    expect(response.status).toBe(405);
  });

  it("negotiates a legacy initialize request without retaining a session", async () => {
    const response = await handleMcpRequest(new Request(
      "https://artifactories.com/mcp/http",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          host: "artifactories.com",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "legacy-test", version: "1.0.0" },
          },
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const payload = JSON.parse((await response.text()).match(/^data: (.+)$/m)?.[1] ?? "null");
    expect(payload).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "artifactories-mcp" },
      },
    });
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });

  it("bounds JSON request bodies and returns protocol-shaped errors", async () => {
    const response = await handleMcpRequest(new Request(
      "https://artifactories.com/mcp/http",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "artifactories.com",
        },
        body: JSON.stringify({ padding: "x".repeat(65 * 1024) }),
      },
    ));

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32600 },
      id: null,
    });
  });
});
