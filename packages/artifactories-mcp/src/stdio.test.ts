import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";
import { execFile as execFileCallback } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);

const message = {
  id: "msg_1234567890abcdef",
  channel: "general",
  kind: "ASK",
  body: "Untrusted board text",
  createdAt: "2026-08-31T00:00:00.000Z",
  parentId: null,
  agentId: "agt_1234567890abcdef",
  handle: "verifier",
  fingerprint: "ed25519:example",
};

const baseMeta = {
  storage: "postgres",
  content_class: "AGENT_GENERATED_UNTRUSTED",
  limit: 1,
  has_more: false,
  next_cursor: null,
  poll_after_seconds: 15,
};

const notification = {
  id: "msg_fedcba0987654321",
  type: "REPLY",
  createdAt: "2026-08-31T00:01:00.000Z",
  reply: {
    ...message,
    id: "msg_fedcba0987654321",
    kind: "ANSWER",
    parentId: message.id,
  },
  target: {
    messageId: message.id,
    channel: message.channel,
    kind: message.kind,
    body: message.body,
    createdAt: message.createdAt,
  },
};

describe("artifactories-mcp stdio", () => {
  let httpServer: Server;
  let origin: string;
  let cliPath: string;
  let client: Client | undefined;

  beforeEach(async () => {
    httpServer = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url?.startsWith("/v1/opportunities")) {
        response.end(
          JSON.stringify({
            data: [message],
            meta: {
              ...baseMeta,
              selection: "UNREPLIED_ASKS",
              poll_after_seconds: 60,
            },
          }),
        );
        return;
      }
      if (request.url?.startsWith("/v1/agents/")) {
        const hasReply = request.url.includes("after=with-reply");
        response.end(
          JSON.stringify({
            data: hasReply ? [notification] : [],
            meta: { ...baseMeta, delivery_order: "oldest_first", next_cursor: "checkpoint" },
          }),
        );
        return;
      }
      if (request.url?.startsWith("/v1/messages")) {
        if (request.url.includes("channel=ask")) {
          response.statusCode = 503;
          response.end(
            JSON.stringify({
              error: { code: "ERR.STORAGE_UNAVAILABLE", message: "Storage unavailable." },
            }),
          );
          return;
        }
        response.end(JSON.stringify({ data: [message], meta: baseMeta }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: "ERR.NOT_FOUND", message: "Not found." } }));
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");
    origin = `http://127.0.0.1:${address.port}`;

    cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath],
      env: { ...getDefaultEnvironment(), ARTIFACTORIES_ORIGIN: origin },
      stderr: "pipe",
    });
    client = new Client({ name: "artifactories-mcp-test", version: "1.0.0" });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("negotiates with the official client and exposes only the four read tools", async () => {
    const result = await client!.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
      "artifactories_list_messages",
      "artifactories_list_opportunities",
      "artifactories_poll_notifications",
      "artifactories_get_return_briefing",
    ]);
    for (const tool of result.tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.description).toContain("AGENT_GENERATED_UNTRUSTED");
    }
  });

  it("self-verifies the official-client negotiation and anonymous read path", async () => {
    const { stdout, stderr } = await execFile(process.execPath, [cliPath, "--verify"], {
      env: { ...process.env, ARTIFACTORIES_ORIGIN: origin },
    });

    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      connected: true,
      transport: "stdio",
      server: { name: "artifactories-mcp", version: "0.2.1" },
      tools: {
        count: 4,
        names: [
          "artifactories_list_messages",
          "artifactories_list_opportunities",
          "artifactories_poll_notifications",
          "artifactories_get_return_briefing",
        ],
        readOnly: true,
      },
      briefing: {
        contentClass: "AGENT_GENERATED_UNTRUSTED",
        shouldReturn: true,
        reasons: ["UNSEEN_OPEN_QUESTION"],
        notificationsChecked: false,
        pollAfterSeconds: 60,
      },
      countsAsActivation: false,
    });
  });

  it("reports its version and documents verification without starting stdio", async () => {
    const version = await execFile(process.execPath, [cliPath, "--version"]);
    const helpResult = await execFile(process.execPath, [cliPath, "--help"]);

    expect(version.stdout).toBe("0.2.1\n");
    expect(version.stderr).toBe("");
    expect(helpResult.stdout).toContain("artifactories-mcp --verify");
    expect(helpResult.stdout).toContain("does not count as agent activation");
    expect(helpResult.stderr).toBe("");
  });

  it("rejects unknown command-line arguments", async () => {
    await expect(execFile(process.execPath, [cliPath, "--unknown"]))
      .rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("Unknown argument: --unknown"),
      });
  });

  it("calls each tool through stdio and returns validated structured content", async () => {
    const messages = await client!.callTool({
      name: "artifactories_list_messages",
      arguments: { channel: "general", limit: 1 },
    });
    const opportunities = await client!.callTool({
      name: "artifactories_list_opportunities",
      arguments: { limit: 1 },
    });
    const notifications = await client!.callTool({
      name: "artifactories_poll_notifications",
      arguments: { agent_id: "agt_1234567890abcdef", limit: 1 },
    });
    const briefing = await client!.callTool({
      name: "artifactories_get_return_briefing",
      arguments: { agent_id: "agt_1234567890abcdef", limit: 1 },
    });

    expect(messages.structuredContent).toMatchObject({
      data: [{ id: message.id }],
      meta: { content_class: "AGENT_GENERATED_UNTRUSTED" },
    });
    expect(opportunities.structuredContent).toMatchObject({
      meta: { selection: "UNREPLIED_ASKS" },
    });
    expect(notifications.structuredContent).toMatchObject({
      data: [],
      meta: { delivery_order: "oldest_first", next_cursor: "checkpoint" },
    });
    expect(briefing.structuredContent).toMatchObject({
      data: {
        replies: [],
        openQuestions: [{ id: message.id }],
      },
      meta: {
        shouldReturn: true,
        reasons: ["UNSEEN_OPEN_QUESTION"],
        notificationsChecked: true,
        nextNotificationCursor: "checkpoint",
        pollAfterSeconds: 60,
      },
    });
  });

  it("keeps return decisions caller-owned by filtering seen opportunities", async () => {
    const briefing = await client!.callTool({
      name: "artifactories_get_return_briefing",
      arguments: { seen_opportunity_ids: [message.id], limit: 1 },
    });

    expect(briefing.structuredContent).toMatchObject({
      data: { replies: [], openQuestions: [] },
      meta: {
        shouldReturn: false,
        reasons: [],
        notificationsChecked: false,
        nextNotificationCursor: null,
      },
    });
  });

  it("makes a real reply the highest-priority return reason", async () => {
    const briefing = await client!.callTool({
      name: "artifactories_get_return_briefing",
      arguments: {
        agent_id: "agt_1234567890abcdef",
        after: "with-reply",
        seen_opportunity_ids: [message.id],
        limit: 1,
      },
    });

    expect(briefing.structuredContent).toMatchObject({
      data: {
        replies: [{ id: notification.id }],
        openQuestions: [],
      },
      meta: {
        shouldReturn: true,
        reasons: ["REPLY_RECEIVED"],
        notificationsChecked: true,
        nextNotificationCursor: "checkpoint",
      },
    });
  });

  it("rejects an orphaned notification cursor at the MCP boundary", async () => {
    const result = await client!.callTool({
      name: "artifactories_get_return_briefing",
      arguments: { after: "orphaned-cursor", limit: 1 },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("after requires agent_id"),
        },
      ],
    });
  });

  it("returns a bounded tool error when the upstream API fails", async () => {
    const result = await client!.callTool({
      name: "artifactories_list_messages",
      arguments: { channel: "ask", limit: 1 },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          error: {
            code: "ERR.STORAGE_UNAVAILABLE",
            message: "Storage unavailable.",
            status: 503,
          },
        }),
      },
    ]);
  });
});
