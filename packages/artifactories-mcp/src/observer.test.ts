import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messagePageSchema, notificationPageSchema, opportunityPageSchema } from "./api.js";
import { createArtifactoriesServer, TOOL_NAMES, type ArtifactoriesReadAdapter } from "./server.js";

const message = {
  id: "msg_1234567890abcdef", channel: "general", kind: "ASK",
  body: "PRIVATE_BOARD_TEXT", createdAt: "2026-08-31T00:00:00.000Z", parentId: null,
  agentId: "agt_1234567890abcdef", handle: "PRIVATE_HANDLE", fingerprint: "PRIVATE_FINGERPRINT",
};
const meta = {
  storage: "postgres", content_class: "AGENT_GENERATED_UNTRUSTED", limit: 25,
  has_more: false, next_cursor: null, poll_after_seconds: 60,
};

describe("optional MCP outcome observer", () => {
  let client: Client | undefined;
  afterEach(async () => { await client?.close(); vi.restoreAllMocks(); });

  async function connect(observer?: (event: unknown) => void) {
    let failing = false;
    const failIfNeeded = () => { if (failing) throw new Error("PRIVATE_ERROR"); };
    const api: ArtifactoriesReadAdapter = {
      async listMessages() {
        failIfNeeded();
        return messagePageSchema.parse({ data: [message], meta });
      },
      async listOpportunities() {
        failIfNeeded();
        return opportunityPageSchema.parse({ data: [message], meta: { ...meta, selection: "UNREPLIED_ASKS" } });
      },
      async pollNotifications() {
        failIfNeeded();
        return notificationPageSchema.parse({ data: [], meta: { ...meta, delivery_order: "oldest_first" } });
      },
    };
    const handler = createMcpHandler(() => createArtifactoriesServer({ api, ...(observer ? { onToolOutcome: observer } : {}) }), { legacy: "stateless" });
    client = new Client({ name: "PRIVATE_CLIENT", version: "PRIVATE_VERSION" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://example.test/mcp"), {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    }));
    return { fail: () => { failing = true; } };
  }

  it("reports only fixed tool names and semantic outcomes, including no-return and isError", async () => {
    const observe = vi.fn();
    const { fail } = await connect(observe);
    for (const name of Object.values(TOOL_NAMES)) {
      await client!.callTool({ name, arguments: { agent_id: message.agentId } });
    }
    await client!.callTool({ name: TOOL_NAMES.getReturnBriefing, arguments: { seen_opportunity_ids: [message.id] } });
    expect(observe.mock.calls).toEqual([
      [expect.objectContaining({ tool: TOOL_NAMES.listMessages, outcome: "nonempty", durationBucket: expect.stringMatching(/^(lt100|100to999|gte1000)$/) })],
      [expect.objectContaining({ tool: TOOL_NAMES.listOpportunities, outcome: "nonempty" })],
      [expect.objectContaining({ tool: TOOL_NAMES.pollNotifications, outcome: "empty" })],
      [expect.objectContaining({ tool: TOOL_NAMES.getReturnBriefing, outcome: "has_return" })],
      [expect.objectContaining({ tool: TOOL_NAMES.getReturnBriefing, outcome: "no_return" })],
    ]);
    fail();
    for (const name of Object.values(TOOL_NAMES)) {
      expect((await client!.callTool({ name, arguments: { agent_id: message.agentId } })).isError).toBe(true);
      expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({ tool: name, outcome: "error" }));
    }
    expect(JSON.stringify(observe.mock.calls)).not.toContain("PRIVATE");
  });

  it("keeps observer exceptions from changing tool results", async () => {
    await connect(() => { throw new Error("PRIVATE_SINK_ERROR"); });
    const result = await client!.callTool({ name: TOOL_NAMES.listMessages, arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ data: [message] });
  });

  it("remains silent when no observer is supplied", async () => {
    const info = vi.spyOn(console, "info");
    const log = vi.spyOn(console, "log");
    await connect();
    await client!.callTool({ name: TOOL_NAMES.getReturnBriefing, arguments: {} });
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
